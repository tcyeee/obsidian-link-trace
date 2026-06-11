import { App, Modal, TFile, setIcon } from "obsidian";
import type ShareOnlinePlugin from "../main";
import { collectLinkedNotesWithStatus } from "./exporter";
import { t } from "./i18n";

export type ShareMode = "publish" | "unpublish";

type SubNoteWithStatus = { file: TFile; shareLink: string };

export class ShareModal extends Modal {
    private plugin: ShareOnlinePlugin;
    private file: TFile;
    private mode: ShareMode;
    private onConfirm: (subNotes: SubNoteWithStatus[]) => void;
    private subNotes: SubNoteWithStatus[] = [];
    private checkStates = new Map<string, boolean>();

    constructor(
        app: App,
        plugin: ShareOnlinePlugin,
        file: TFile,
        mode: ShareMode,
        onConfirm: (subNotes: SubNoteWithStatus[]) => void
    ) {
        super(app);
        this.plugin = plugin;
        this.file = file;
        this.mode = mode;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("opal-share-modal");

        this.subNotes = this.plugin.settings.includeLinkedNotes
            ? collectLinkedNotesWithStatus(this.app, this.file)
            : [];

        contentEl.createEl("h2", {
            text: this.mode === "publish" ? t("modal.publish.title") : t("modal.unpublish.title"),
            cls: "opal-modal-title",
        });

        // Main note section
        const mainSection = contentEl.createDiv({ cls: "opal-modal-section" });
        mainSection.createEl("p", {
            cls: "opal-modal-section-label",
            text: this.mode === "publish" ? t("modal.mainNote") : t("modal.mainNote.stopping"),
        });
        this.renderNoteItem(mainSection, this.file.basename + ".md", null);

        // Sub-notes section
        if (this.mode === "publish") {
            this.renderPublishSubNotes(contentEl);
        } else {
            this.renderUnpublishSubNotes(contentEl);
        }

        // Button row
        const btnRow = contentEl.createDiv({ cls: "opal-modal-btn-row" });
        const cancelBtn = btnRow.createEl("button", { text: t("modal.btn.cancel") });
        cancelBtn.addEventListener("click", () => this.close());

        const confirmBtn = btnRow.createEl("button", {
            text: this.mode === "publish" ? t("modal.btn.confirmPublish") : t("modal.btn.confirmUnpublish"),
            cls: "mod-cta",
        });
        confirmBtn.addEventListener("click", () => {
            const result =
                this.mode === "unpublish"
                    ? this.subNotes.filter(
                          (sn) => sn.shareLink && this.checkStates.get(sn.file.path)
                      )
                    : this.subNotes;
            this.close();
            this.onConfirm(result);
        });
    }

    private renderNoteItem(
        parent: HTMLElement,
        label: string,
        badge: string | null
    ): HTMLElement {
        const item = parent.createDiv({ cls: "opal-modal-note-item" });
        const iconEl = item.createDiv({ cls: "opal-modal-note-icon" });
        setIcon(iconEl, "file-text");
        item.createSpan({ text: label, cls: "opal-modal-note-name" });
        if (badge) {
            item.createSpan({ text: badge, cls: "opal-modal-badge" });
        }
        return item;
    }

    private renderPublishSubNotes(contentEl: HTMLElement) {
        if (this.subNotes.length === 0) return;
        const section = contentEl.createDiv({ cls: "opal-modal-section" });
        section.createEl("p", {
            cls: "opal-modal-section-label",
            text: t("modal.subNotes.publish", { count: String(this.subNotes.length) }),
        });
        for (const sn of this.subNotes) {
            const badge = sn.shareLink ? t("modal.badge.hasLink") : t("modal.badge.willUpload");
            const item = this.renderNoteItem(section, sn.file.basename + ".md", badge);
            if (sn.shareLink) {
                item.addClass("opal-modal-note-item--skip");
            }
        }
    }

    private renderUnpublishSubNotes(contentEl: HTMLElement) {
        if (this.subNotes.length === 0) return;
        const section = contentEl.createDiv({ cls: "opal-modal-section" });
        section.createEl("p", {
            cls: "opal-modal-section-label",
            text: t("modal.subNotes.unpublish"),
        });
        for (const sn of this.subNotes) {
            const item = section.createDiv({ cls: "opal-modal-note-item" });
            if (sn.shareLink) {
                this.checkStates.set(sn.file.path, true);
                const checkbox = item.createEl("input");
                checkbox.type = "checkbox";
                checkbox.checked = true;
                checkbox.addClass("opal-modal-checkbox");
                checkbox.addEventListener("change", () => {
                    this.checkStates.set(sn.file.path, checkbox.checked);
                });
            } else {
                // Placeholder to keep alignment with checkboxed items
                item.createDiv({ cls: "opal-modal-checkbox-placeholder" });
            }
            const iconEl = item.createDiv({ cls: "opal-modal-note-icon" });
            setIcon(iconEl, "file-text");
            item.createSpan({ text: sn.file.basename + ".md", cls: "opal-modal-note-name" });
            if (!sn.shareLink) {
                item.addClass("opal-modal-note-item--skip");
            }
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}
