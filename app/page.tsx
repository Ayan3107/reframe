"use client";

import {
  ChangeEvent,
  DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type RecordItem = {
  asset_id: string;
  public_id: string;
  secure_url: string;
  optimized_url?: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  created_at: string;
  caption: string;
  objects: string[];
  quality: string;
  quality_score: number | null;
  analyzed_at: string | null;
  title: string;
  notes: string;
  category: string;
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const COLLECTION_OPTIONS = ["Insurance", "Home", "Repairs", "Purchases", "Travel", "Personal", "Other"];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function qualityPercentage(score: number | null) {
  if (score === null || Number.isNaN(score)) return null;
  return Math.round(score * 100);
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getRecordTitle(record: RecordItem) {
  if (record.title?.trim()) return record.title.trim();
  const caption = record.caption?.trim();
  if (
    !caption ||
    caption === "No caption available." ||
    caption === "No caption generated."
  ) {
    return record.analyzed_at ? "Visual record" : "Analysis needed";
  }

  const words = caption.split(/\s+/);

  if (words.length <= 7) return caption;

  return `${words.slice(0, 7).join(" ")}…`;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [records, setRecords] = useState<RecordItem[]>([]);
  const [selectedRecord, setSelectedRecord] =
    useState<RecordItem | null>(null);
  const [search, setSearch] = useState("");
  const [activeCollection, setActiveCollection] = useState("All collections");
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const closeSelectedRecord = useCallback(() => setSelectedRecord(null), []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("q", search.trim());
        if (activeCollection !== "All collections") params.set("category", activeCollection);
        const response = await fetch(`/api/records?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load visual records.");
        setRecords(data.records || []);
        setNextCursor(data.next_cursor || null);
        setError("");
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Failed to load visual records.");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingRecords(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [search, activeCollection]);

  async function loadMoreRecords() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ cursor: nextCursor });
      if (search.trim()) params.set("q", search.trim());
      if (activeCollection !== "All collections") params.set("category", activeCollection);
      const response = await fetch(`/api/records?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load more records.");
      setRecords((current) => [...current, ...(data.records || [])]);
      setNextCursor(data.next_cursor || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more records.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function uploadFile(file: File) {
    setError("");
    setNotice("");

    if (uploading) return;

    if (!file.type.startsWith("image/")) {
      setError(
        "RE:FRAME currently supports image evidence."
      );
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setError("Choose an image smaller than 10 MB.");
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed.");
      }

      if (data.asset) {
        const createdRecord: RecordItem = {
          asset_id: data.asset.asset_id,
          public_id: data.asset.public_id,
          secure_url: data.asset.secure_url,
          optimized_url: data.asset.optimized_url,
          format: data.asset.format,
          width: data.asset.width,
          height: data.asset.height,
          bytes: data.asset.bytes,
          created_at:
            data.asset.created_at ||
            new Date().toISOString(),
          caption:
            data.intelligence?.caption ||
            "No caption available.",
          objects:
            data.intelligence?.objects || [],
          quality: data.intelligence?.quality || "unknown",
          quality_score:
            data.intelligence?.quality_score ?? null,
          analyzed_at:
            data.intelligence?.analyzed_at ?? null,
          title: data.record?.title || "",
          notes: data.record?.notes || "",
          category: data.record?.category || "Unsorted",
        };

        setRecords((current) => [
          createdRecord,
          ...current.filter((record) => record.asset_id !== createdRecord.asset_id),
        ].slice(0, 50));
        setSelectedRecord(createdRecord);
      }

      if (data.duplicate) {
        setNotice("This exact image is already in your visual memory. I opened its existing record without saving another copy.");
      }

      if (data.intelligence?.object_analysis_error) {
        setError(`Image saved. COCO detection was unavailable: ${data.intelligence.object_analysis_error}`);
      }
      if (data.intelligence?.persistence_error) {
        setError(`Image uploaded, but its analysis details could not be saved. ${data.intelligence.persistence_error}`);
      }
      if (data.intelligence?.quality_analysis_error && data.intelligence?.quality_score == null) {
        setError(`Image saved, but quality analysis was unavailable: ${data.intelligence.quality_analysis_error}`);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while processing the image."
      );
    } finally {
      setUploading(false);
    }
  }

  async function saveRecordDetails(
    record: RecordItem,
    details: { title: string; notes: string; category: string },
  ) {
    const response = await fetch("/api/records", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_id: record.public_id, ...details }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not save record details.");

    const updated = { ...record, title: data.title, notes: data.notes, category: data.category };
    setRecords((current) => current.map((item) =>
      item.asset_id === updated.asset_id ? updated : item,
    ));
    setSelectedRecord(updated);
  }

  async function analyzeSavedRecord(record: RecordItem) {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_id: record.public_id }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not analyze this saved image.");

    const updated = { ...record, ...data.intelligence };
    setRecords((current) => current.map((item) =>
      item.asset_id === updated.asset_id ? updated : item,
    ));
    setSelectedRecord(updated);
    return data.intelligence as {
      object_analysis_error: string | null;
      quality_analysis_error: string | null;
    };
  }

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (file) uploadFile(file);

    event.target.value = "";
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>
  ) {
    event.preventDefault();
    setDragging(false);

    const file = event.dataTransfer.files?.[0];

    if (file) uploadFile(file);
  }

  const normalizedSearch = normalize(search);

  const searchTerms = normalizedSearch
    .split(/\s+/)
    .filter(Boolean);

  const filteredRecords =
    searchTerms.length === 0
      ? records
      : records.filter((record) => {
          const searchableText = normalize(
            [
              record.caption,
              record.title,
              record.notes,
              record.category,
              record.public_id,
              `quality ${record.quality}`,
              ...record.objects,
            ].join(" ")
          );

          return searchTerms.every((term) =>
            searchableText.includes(term)
          );
        });

  return (
    <main id="top" className="min-h-screen bg-[#08090b] text-white">
      <div className="mx-auto flex min-h-screen max-w-[1500px]">
        <aside className="hidden w-[245px] shrink-0 border-r border-white/8 px-5 py-7 lg:block">
          <div className="mb-12">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-sm font-black text-black">
                R
              </div>

              <div>
                <div className="text-[15px] font-semibold tracking-tight">
                  RE:FRAME
                </div>

                <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">
                  Visual Memory
                </div>
              </div>
            </div>
          </div>

          <nav className="space-y-1">
            <NavItem active href="#top" label="Visual memory" icon="◈" />
            <NavItem href="#records" label="Records" icon="▣" />
            <NavItem href="#collections" label="Collections" icon="□" />
            <NavItem href="#visual-search" label="Search" icon="⌕" />
          </nav>

          <div className="absolute bottom-7 hidden w-[195px] lg:block">
            <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
              <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-white/30">
                Powered by
              </div>

              <div className="text-sm font-medium text-white/80">
                Cloudinary
              </div>

              <div className="mt-1 text-xs leading-5 text-white/35">
                Media storage, transformation and AI intelligence.
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex min-h-[76px] items-center justify-between gap-4 border-b border-white/8 px-6 py-4 md:px-10">
            <div>
              <div className="text-xs text-white/35">
                Visual Memory
              </div>

              <div className="mt-1 text-sm font-medium text-white/80">
                Your visual memory, organized by meaning.
              </div>
            </div>

            <button
              onClick={() =>
                fileInputRef.current?.click()
              }
              disabled={uploading}
              className="shrink-0 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? "Uploading & analyzing…" : "+ Add evidence"}
            </button>
          </header>

          <div className="px-6 py-8 md:px-10 md:py-10">
            <section className="max-w-4xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.025] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-white/40">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Cloudinary intelligence active
              </div>

              <h1 aria-label="Find anything you’ve seen." className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-white md:text-6xl">
                Find anything you&apos;ve
                <span className="text-white/35">
                  {" "}
                  seen.
                </span>
              </h1>

              <p className="mt-5 max-w-2xl text-sm leading-6 text-white/40 md:text-base">
                RE:FRAME turns ordinary images into searchable visual
                records by understanding what is actually inside them.
              </p>
            </section>

            <section className="mt-9">
              <div className="relative">
                <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-lg text-white/25">
                  ⌕
                </span>

                <input
                  id="visual-search"
                  aria-label="Search your visual memory"
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                  placeholder="Search your visual memory..."
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.025] py-4 pl-12 pr-5 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/20 focus:bg-white/[0.04]"
                />

                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs text-white/30 hover:bg-white/5 hover:text-white/70"
                  >
                    Clear
                  </button>
                )}
              </div>

              {normalizedSearch && (
                <div className="mt-3 text-[11px] text-white/30">
                  Showing{" "}
                  <span className="text-white/60">
                    {filteredRecords.length} {filteredRecords.length === 1 ? "result" : "results"}
                  </span>
                </div>
              )}
            </section>

            <section className="mt-12">
              <div id="records" />
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/25">
                    Your visual memory
                  </div>

                  <h2 className="mt-2 text-xl font-medium tracking-tight">
                    {normalizedSearch
                      ? "Search results"
                      : "Recent records"}
                  </h2>
                </div>

                <div className="flex items-center gap-4">
                  <label id="collections" className="flex items-center gap-2 text-xs text-white/35">
                    Collection
                    <select
                      value={activeCollection}
                      onChange={(event) => setActiveCollection(event.target.value)}
                      className="rounded-lg border border-white/10 bg-[#111316] px-2.5 py-2 text-xs text-white/65 outline-none focus:border-white/25"
                    >
                      <option>All collections</option>
                      {COLLECTION_OPTIONS.map((collection) => (
                        <option key={collection}>{collection}</option>
                      ))}
                      <option>Unsorted</option>
                    </select>
                  </label>

                  <div className="text-xs text-white/25">
                    {records.length} shown
                  </div>
                </div>
              </div>

              {loadingRecords && (
                <div className="mt-6 rounded-3xl border border-white/8 bg-white/[0.02] p-10 text-center">
                  <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-white/70" />

                  <div className="mt-4 text-xs text-white/30">
                    Loading visual memory...
                  </div>
                </div>
              )}

              {!loadingRecords &&
                filteredRecords.length === 0 && (
                  <div className="mt-6 rounded-3xl border border-white/8 bg-white/[0.02] p-12 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-xl text-white/30">
                      ◈
                    </div>

                    <h3 className="mt-5 text-sm font-medium text-white/70">
                      {normalizedSearch
                        ? "No matching memories"
                        : activeCollection !== "All collections"
                          ? `No records in ${activeCollection}`
                          : "Your visual memory is empty"}
                    </h3>

                    <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-white/30">
                      {normalizedSearch
                        ? "Try a different word or search for something described in your images."
                        : activeCollection !== "All collections"
                          ? "Assign a record to this collection from its detail view, or choose a different collection."
                          : "Upload your first piece of visual evidence and RE:FRAME will begin understanding it."}
                    </p>
                  </div>
                )}

              {!loadingRecords && nextCursor && (
                <div className="mt-7 flex justify-center">
                  <button
                    onClick={loadMoreRecords}
                    disabled={loadingMore}
                    className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-white/60 transition hover:border-white/20 hover:text-white disabled:opacity-50"
                  >
                    {loadingMore ? "Loading records…" : "Load more records"}
                  </button>
                </div>
              )}

              {!loadingRecords &&
                filteredRecords.length > 0 && (
                  <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {filteredRecords.map(
                      (record) => (
                        <RecordCard
                          key={record.asset_id}
                          record={record}
                          onClick={() =>
                            setSelectedRecord(record)
                          }
                        />
                      )
                    )}
                  </div>
                )}
            </section>

            <section className="mt-12">
              <div
                onClick={() =>
                  fileInputRef.current?.click()
                }
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() =>
                  setDragging(false)
                }
                onDrop={handleDrop}
                className={`group relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border transition ${
                  dragging
                    ? "border-white/40 bg-white/[0.07]"
                    : "border-white/8 bg-white/[0.018] hover:border-white/15 hover:bg-white/[0.03]"
                }`}
              >
                <div className="relative flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-lg text-white/50">
                  ↑
                </div>

                <div className="relative mt-4 text-sm font-medium text-white/65" aria-live="polite">
                  {uploading ? "Uploading and analyzing with Cloudinary" : "Add another visual memory"}
                </div>

                <div className="relative mt-2 text-xs text-white/25">
                  {uploading ? "Your original image is being stored and analyzed." : "Drop an image here or click to browse"}
                </div>
              </div>
            </section>

            {error && (
              <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-xs text-red-300">
                {error}
              </div>
            )}
            {notice && (
              <div role="status" className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-xs text-emerald-200/80">
                {notice}
              </div>
            )}
          </div>
        </section>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {selectedRecord && (
        <RecordModal
          record={selectedRecord}
          onSave={(details) => saveRecordDetails(selectedRecord, details)}
          onAnalyze={() => analyzeSavedRecord(selectedRecord)}
          onClose={closeSelectedRecord}
        />
      )}
    </main>
  );
}

function RecordCard({
  record,
  onClick,
}: {
  record: RecordItem;
  onClick: () => void;
}) {
  const percentage = qualityPercentage(
    record.quality_score
  );

  return (
    <button
      onClick={onClick}
      className="group overflow-hidden rounded-3xl border border-white/8 bg-white/[0.02] text-left transition hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.035]"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-black">
        {/* Cloudinary delivers f_auto/q_auto transformed image URLs here. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary optimizes delivery with f_auto/q_auto. */}
        <img
          src={record.optimized_url || record.secure_url}
          alt={record.caption}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"
        />

        <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[9px] uppercase tracking-[0.14em] text-white/55 backdrop-blur">
          {record.format}
        </div>

        {percentage !== null && (
          <div className="absolute bottom-3 right-3 rounded-full border border-white/10 bg-black/65 px-2.5 py-1 text-[9px] text-white/65 backdrop-blur">
            {percentage}% quality
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="text-sm font-medium leading-5 text-white/80">
          {getRecordTitle(record)}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-[9px] text-white/35">
            {record.category || "Unsorted"}
          </span>
          {record.objects
            .slice(0, 4)
            .map((object) => (
              <span
                key={object}
                className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-[9px] text-white/35"
              >
                {object}
              </span>
            ))}

          {record.objects.length === 0 && (
            <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-[9px] text-white/25">
              {record.analyzed_at ? "No labels returned" : "Needs analysis"}
            </span>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-white/6 pt-4">
          <span className="text-[9px] uppercase tracking-[0.14em] text-white/20">
            {record.quality}
          </span>

          <span className="text-[9px] text-white/20">
            {formatDate(record.created_at)}
          </span>
        </div>
      </div>
    </button>
  );
}

function RecordModal({
  record,
  onSave,
  onAnalyze,
  onClose,
}: {
  record: RecordItem;
  onSave: (details: { title: string; notes: string; category: string }) => Promise<void>;
  onAnalyze: () => Promise<{
    object_analysis_error: string | null;
    quality_analysis_error: string | null;
  }>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const percentage = qualityPercentage(
    record.quality_score
  );
  const [title, setTitle] = useState(record.title || "");
  const [notes, setNotes] = useState(record.notes || "");
  const [category, setCategory] = useState(
    record.category === "Unsorted" ? "" : record.category || "",
  );
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsMessage, setDetailsMessage] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState("");

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dialogRef.current?.focus();

    function keepKeyboardFocus(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", keepKeyboardFocus);
    return () => {
      document.removeEventListener("keydown", keepKeyboardFocus);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  async function handleSaveDetails() {
    setSavingDetails(true);
    setDetailsMessage("");
    try {
      await onSave({ title, notes, category });
      setDetailsMessage("Saved to this Cloudinary record.");
    } catch (error) {
      setDetailsMessage(error instanceof Error ? error.message : "Could not save details.");
    } finally {
      setSavingDetails(false);
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalysisMessage("");
    try {
      const result = await onAnalyze();
      const failures = [result.object_analysis_error, result.quality_analysis_error].filter(Boolean);
      setAnalysisMessage(
        failures.length > 0
          ? `Saved what Cloudinary returned. ${failures.join(" ")}`
          : "Analysis saved to this Cloudinary record.",
      );
    } catch (error) {
      setAnalysisMessage(error instanceof Error ? error.message : "Could not analyze this image.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Visual record: ${getRecordTitle(record)}`}
        tabIndex={-1}
        className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-3xl border border-white/10 bg-[#0d0f12] shadow-2xl"
        onClick={(event) =>
          event.stopPropagation()
        }
      >
        <div className="flex items-center justify-between border-b border-white/8 px-6 py-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/25">
              Visual record
            </div>

            <div className="mt-1 text-sm font-medium text-white/80">
              {getRecordTitle(record)}
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-white/8 px-3 py-2 text-xs text-white/40 transition hover:bg-white/5 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="flex min-h-[350px] items-center justify-center bg-black p-4 lg:min-h-[600px]">
            {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary optimizes delivery with f_auto/q_auto. */}
            <img
              src={record.optimized_url || record.secure_url}
              alt={record.caption}
              className="max-h-[70vh] max-w-full rounded-xl object-contain"
            />
          </div>

          <div className="border-t border-white/8 p-6 lg:border-l lg:border-t-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/25">
              AI intelligence
            </div>

            {(!record.analyzed_at || analysisMessage) && (
              <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.025] p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs leading-5 text-white/40">
                    {!record.analyzed_at
                      ? "This saved image has no analysis record yet. Analyze it without uploading it again."
                      : "Analysis details were updated on the saved Cloudinary asset."}
                  </p>
                  {!record.analyzed_at && (
                    <button
                      onClick={handleAnalyze}
                      disabled={analyzing}
                      className="shrink-0 rounded-lg border border-white/15 px-3 py-2 text-xs text-white/70 transition hover:border-white/30 hover:text-white disabled:opacity-50"
                    >
                      {analyzing ? "Analyzing saved image…" : "Analyze saved image"}
                    </button>
                  )}
                </div>
                {analysisMessage && (
                  <p aria-live="polite" className="mt-2 text-[11px] text-white/45">
                    {analysisMessage}
                  </p>
                )}
              </div>
            )}

            <div className="mt-6">
              <div className="text-[9px] uppercase tracking-[0.18em] text-white/25">
                Caption
              </div>

              <p className="mt-3 text-base leading-7 text-white/75">
                {record.caption}
              </p>
            </div>

            <div className="mt-7 border-t border-white/8 pt-6">
              <div className="text-[9px] uppercase tracking-[0.18em] text-white/25">
                Your context
              </div>
              <label className="mt-3 block text-xs text-white/50" htmlFor="record-title">
                Record title
              </label>
              <input
                id="record-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                placeholder="e.g. Phone damage from October delivery"
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/20 focus:border-white/25"
              />
              <label className="mt-4 block text-xs text-white/50" htmlFor="record-notes">
                Notes
              </label>
              <textarea
                id="record-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={900}
                rows={3}
                placeholder="Add the details you will want to remember later."
                className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2.5 text-sm leading-5 text-white outline-none placeholder:text-white/20 focus:border-white/25"
              />
              <div className="mt-1 text-right text-[10px] text-white/25" aria-live="polite">
                {notes.length}/900
              </div>
              <label className="mt-4 block text-xs text-white/50" htmlFor="record-collection">
                Collection
              </label>
              <select
                id="record-collection"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-[#111316] px-3 py-2.5 text-sm text-white outline-none focus:border-white/25"
              >
                <option value="">Unsorted</option>
                {COLLECTION_OPTIONS.map((collection) => (
                  <option key={collection} value={collection}>{collection}</option>
                ))}
              </select>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p aria-live="polite" className="text-[11px] text-white/45">{detailsMessage}</p>
                <button
                  onClick={handleSaveDetails}
                  disabled={savingDetails || (
                    title === (record.title || "") &&
                    notes === (record.notes || "") &&
                    category === (record.category === "Unsorted" ? "" : record.category || "")
                  )}
                  className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {savingDetails ? "Saving…" : "Save details"}
                </button>
              </div>
            </div>

            <div className="mt-8">
              <div className="text-[9px] uppercase tracking-[0.18em] text-white/25">
                Detected objects
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {record.objects.length > 0 ? (
                  record.objects.map(
                    (object) => (
                      <span
                        key={object}
                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/55"
                      >
                        {object}
                      </span>
                    )
                  )
                ) : (
                  <span className="text-xs text-white/30">
                    No object labels returned.
                  </span>
                )}
              </div>
            </div>

            <div className="mt-8">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.18em] text-white/25">
                    Image quality
                  </div>

                  <div className="mt-2 text-sm font-medium capitalize text-white/70">
                    {record.quality}
                  </div>
                </div>

                {percentage !== null && (
                  <div className="text-2xl font-semibold">
                    {percentage}%
                  </div>
                )}
              </div>

              {percentage !== null && (
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-white"
                    style={{
                      width: `${percentage}%`,
                    }}
                  />
                </div>
              )}
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3">
              <Detail
                label="Dimensions"
                value={`${record.width} × ${record.height}`}
              />

              <Detail
                label="File size"
                value={formatBytes(record.bytes)}
              />

              <Detail
                label="Format"
                value={record.format.toUpperCase()}
              />

              <Detail
                label="Created"
                value={formatDate(record.created_at)}
              />
            </div>

            <div className="mt-8 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <div className="text-[9px] uppercase tracking-[0.18em] text-white/20">
                Cloudinary asset
              </div>

              <div className="mt-2 break-all font-mono text-[10px] leading-5 text-white/30">
                {record.public_id}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/7 bg-white/[0.02] p-3">
      <div className="text-[8px] uppercase tracking-[0.15em] text-white/20">
        {label}
      </div>

      <div className="mt-1.5 text-xs text-white/55">
        {value}
      </div>
    </div>
  );
}

function NavItem({
  href,
  label,
  icon,
  active = false,
}: {
  href: string;
  label: string;
  icon: string;
  active?: boolean;
}) {
  return (
    <a
      href={href}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs transition ${
        active
          ? "bg-white/[0.07] text-white"
          : "text-white/35 hover:bg-white/[0.035] hover:text-white/70"
      }`}
    >
      <span className="w-4 text-center text-sm">
        {icon}
      </span>

      {label}
    </a>
  );
}
