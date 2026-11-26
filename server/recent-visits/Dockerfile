FROM golang:1.25-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
RUN CGO_ENABLED=0 go build -trimpath -o /recent-visits .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates
COPY --from=build /recent-visits /usr/local/bin/recent-visits
USER 65534:65534
ENV LISTEN_ADDR=:8787
EXPOSE 8787
ENTRYPOINT ["/usr/local/bin/recent-visits"]
