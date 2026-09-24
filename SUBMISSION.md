# RE:FRAME — HackIndia submission draft

This file contains the submission copy and demo outline. Replace the bracketed links only after the public repository, deployed demo, and recorded video exist.

## Project description

RE:FRAME is a visual memory workspace that turns everyday photos and evidence into searchable records. Cloudinary stores and delivers each original image, runs available captioning, quality, and object analysis, and keeps the resulting intelligence and user context with the asset. People can search across their stored records by visible meaning, review the source image and its metadata, add notes, and organize evidence into collections such as Repairs, Home, or Insurance. This makes photos useful later for warranties, damaged deliveries, maintenance, travel, and other moments when remembering a filename is not enough.

## Short pitch

Photo libraries remember when a picture was taken. RE:FRAME helps you find it by what it shows. Upload once, let Cloudinary analyze and organize it, then search your visual evidence when you need it.

## Track alignment

- **AI Media Pipelines:** upload, AI content analysis, object tags when returned, quality data, structured context, Cloudinary Search API, and optimized delivery.
- **Your Media-Savvy Startup:** a practical visual evidence product with a media-centered workflow and persistent records.
- **Generative Content Workflows:** do not select this track unless the final build adds a genuine Cloudinary generation or variation workflow. The current product does not claim image generation.

## Demo script (target: 2:45)

### 0:00–0:25 — Problem

“People keep important evidence in camera rolls: damage, purchases, repairs, travel, and receipts. The problem is finding the right photo later. Folders and dates describe when it was saved, not what it means.”

### 0:25–1:00 — Capture and understand

Upload one real image that is safe to show publicly. Explain that the original is stored in Cloudinary and that captioning, image quality, and COCO object detection are requested against that asset. Show the returned information as it actually appears. Do not promise a label or score when Cloudinary does not return one.

### 1:00–1:30 — Make a record

Open the record. Point out the image, caption, detected labels if available, quality result, dimensions, format, date, and Cloudinary public ID. Add a concise title or note and file it into a real collection, then show that it remains after refresh.

### 1:30–2:05 — Find it again

Search for a word from the image caption or a detected label (the current verified examples include `snake` and `person`). Explain that this is deterministic search over the stored Cloudinary-backed record set, not a claim of semantic AI search.

### 2:05–2:25 — Cloudinary delivery

Show the transformed image used in the app and mention `f_auto`, `q_auto`, and size limiting. If useful, briefly show the Cloudinary public ID in the record details.

### 2:25–2:45 — Impact

“RE:FRAME turns a pile of photos into evidence you can retrieve. The same workflow can support repairs, warranties, deliveries, home maintenance, and other visual records.”

## Release links

- Public GitHub repository: **[add after publication]**
- Live demo: **[add after deployment]**
- 2–4 minute demo video: **[add after recording]**
- HackIndia submission: **[add after submission]**

## Final release checklist

- [ ] Run `npm run lint` and `npm run build` on the release version.
- [ ] Check `git status`, confirm `.env.local` is ignored, and scan tracked files for credentials.
- [ ] Publish the source as a public GitHub repository; do not include private evidence images or credentials.
- [ ] Deploy with Cloudinary values configured as server-only environment variables.
- [ ] Test the deployed URL with a non-sensitive image and verify upload, persistence, search, detail view, and optimized delivery.
- [ ] Record a 2–4 minute demo against the deployed URL.
- [ ] Complete the HackIndia survey/submission and confirm all links and track choices.
