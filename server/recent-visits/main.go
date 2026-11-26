package main

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const endpoint = "/api/v0/recent-visits"

const recentVisitsQuery = `
	SELECT recent.created_at AT TIME ZONE 'UTC' AS timestamp,
	       split_part(recent.location, '-', 1) AS country_code,
	       coalesce(location.country_name, '') AS country,
	       coalesce(location.region_name, '') AS region,
	       coalesce(system.name, '') AS os
	FROM (
		SELECT h.hit_id, h.created_at, h.location, h.system_id
		FROM paths AS p
		JOIN hits AS h ON h.path_id = p.path_id AND h.site_id = p.site_id
		WHERE p.site_id = $1 AND lower(p.path) = lower($2) AND coalesce(p.event, 0) = 0
		ORDER BY h.created_at DESC, h.hit_id DESC
		LIMIT 5
	) AS recent
	LEFT JOIN locations AS location ON location.iso_3166_2 = recent.location AND recent.location <> ''
	LEFT JOIN systems AS system ON system.system_id = recent.system_id
	ORDER BY recent.created_at DESC, recent.hit_id DESC`

type visit struct {
	Timestamp   time.Time `json:"timestamp"`
	CountryCode string    `json:"countryCode"`
	Country     string    `json:"country"`
	Region      string    `json:"region"`
	OS          string    `json:"os"`
}

func recentVisits(pool *pgxpool.Pool, siteID int32, host, token string) http.Handler {
	expected := sha256.Sum256([]byte("Bearer " + token))
	mux := http.NewServeMux()
	mux.HandleFunc(endpoint, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "private, no-store")
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", http.MethodGet)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		authorization := sha256.Sum256([]byte(r.Header.Get("Authorization")))
		if subtle.ConstantTimeCompare(authorization[:], expected[:]) != 1 {
			w.Header().Set("WWW-Authenticate", "Bearer")
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		query := r.URL.Query()
		if !strings.EqualFold(query.Get("host"), host) {
			http.Error(w, "unknown share host", http.StatusNotFound)
			return
		}
		path := query.Get("path")
		if !strings.HasPrefix(path, "/") || len(path) > 2048 {
			http.Error(w, "invalid share path", http.StatusBadRequest)
			return
		}
		path = "/" + strings.Trim(path, "/")
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		rows, err := pool.Query(ctx, recentVisitsQuery, siteID, path)
		if err != nil {
			log.Print("recent visits: query failed")
			http.Error(w, "could not read visits", http.StatusServiceUnavailable)
			return
		}
		visits, err := pgx.CollectRows(rows, pgx.RowToStructByPos[visit])
		if err != nil {
			log.Print("recent visits: could not read rows")
			http.Error(w, "could not read visits", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(visits); err != nil {
			log.Print("recent visits: could not write response")
		}
	})
	return mux
}

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	shareHost := strings.TrimSpace(os.Getenv("SHARE_HOST"))
	token := strings.TrimSpace(os.Getenv("RECENT_VISITS_TOKEN"))
	siteID, err := strconv.ParseInt(os.Getenv("GOATCOUNTER_SITE_ID"), 10, 32)
	if err != nil || siteID < 1 || databaseURL == "" || shareHost == "" || len(token) < 32 {
		log.Fatal("configure DATABASE_URL, GOATCOUNTER_SITE_ID, SHARE_HOST and a RECENT_VISITS_TOKEN of at least 32 characters")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	pool, err := pgxpool.New(ctx, databaseURL)
	cancel()
	if err != nil {
		log.Fatal("invalid DATABASE_URL")
	}
	defer pool.Close()
	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8787"
	}
	server := &http.Server{
		Addr:              addr,
		Handler:           recentVisits(pool, int32(siteID), shareHost, token),
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      5 * time.Second,
		IdleTimeout:       30 * time.Second,
	}
	log.Fatal(server.ListenAndServe())
}
