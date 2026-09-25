# RE:FRAME

### Your visual memory, organized by meaning.

RE:FRAME turns photos and screenshots into searchable visual records. Instead of remembering a filename or upload date, search for what the image shows: *a brown snake*, *a person*, or *the damaged item from last week*.

Built for the **HackIndia Pixels to Products / Cloudinary AI Hackathon 2026**. Project deadline: October 4, 2026.

## The product

People use images as evidence for repairs, deliveries, warranties, travel, home maintenance, purchases, and everyday memories. Traditional photo libraries sort those images by date and folder. RE:FRAME organizes them by meaning.

The product loop is **Capture → Understand → Organize → Find → Act**:

1. Add a photo by browsing or drag and drop.
2. Cloudinary stores the original and runs captioning and image-quality analysis.
3. COCO object detection runs against that same Cloudinary asset. Available labels are kept as Cloudinary tags and record context.
4. Search the Cloudinary asset library by caption words, detected labels, tags, format, or public ID.
5. Open a record to inspect the image, caption, labels, quality score, dimensions, file size, date, and Cloudinary ID.
6. Add your own title and notes, then file the record into a persistent collection such as Home, Repairs, or Insurance.

Analysis is best effort: if one model is unavailable, the image remains stored and the other returned information is still shown. RE:FRAME displays only labels returned by Cloudinary; it does not invent detections.

## Cloudinary in the implementation

Cloudinary is the media system of record, not just a file destination:

- **Ingest and storage:** the server-side Node SDK streams the original image to Cloudinary in `reframe/evidence`. Cloudinary stores and analyzes the source asset; the API secret and API key stay on the server.
- **Duplicate protection:** the server creates a secret-keyed content address from the image bytes. The Cloudinary upload uses `overwrite: false`; selecting the same exact file again opens the stored record and skips new storage and AI analysis. Existing records with older random IDs are left untouched.
- **AI analysis:** upload-time captioning and quality analysis, followed by Cloudinary update calls for COCO object detection and IQA.
- **Organization:** captions, labels, quality, timestamps, user titles, notes, and collection names are saved as contextual metadata on each Cloudinary asset. COCO labels are also available as Cloudinary tags.
- **Search:** the server uses Cloudinary's Search API and tokenized search expressions across the stored asset set, with cursor pagination. Search is deterministic; it is not presented as semantic AI search.
- **Delivery:** cards and detail views use Cloudinary delivery URLs with `f_auto`, `q_auto`, and a size limit transformation.

The UI and API do not expose the Cloudinary API secret. AI model availability depends on the Cloudinary product environment and its enabled add-ons.

## Stack and architecture

- Next.js 16 App Router and React
- TypeScript
- Tailwind CSS 4
- Cloudinary Node SDK
- Cloudinary Search API and contextual metadata

```text
app/page.tsx                         Visual memory, search, upload, grid, record detail
app/api/upload/route.ts              Validate, upload, analyze, save Cloudinary context
app/api/records/route.ts             Search Cloudinary assets and normalize records
app/api/analyze/route.ts              Re-run analysis on an existing Cloudinary asset
lib/cloudinary-analysis.ts            Normalize caption, COCO, and IQA responses
lib/content-address.mjs               Create stable secret-keyed upload IDs
tests/                                Unit checks for duplicate and tag behavior
app/layout.tsx                        App metadata and document shell
app/globals.css                       Global theme and system font stack
```

Cloudinary remains the source of truth for media and record metadata, so no separate database is required for the current single-workspace product.

## Run locally

Requirements: Node.js 22.12 or later and npm. The project targets Node.js 24 for deployment.

1. Install dependencies:

   ```powershell
   cd C:\Users\ayanh\reframe
   npm install
   ```

2. Copy the environment template:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Open `.env.local` in VS Code and replace the three placeholder values with the Cloudinary cloud name, API key, and API secret from your Cloudinary console. Keep `.env.local` private; it is ignored by git. `CLOUDINARY_EVIDENCE_FOLDER` can stay `reframe/evidence` for local development.

4. Start the development server:

   ```powershell
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

The app accepts image files up to 10 MB. The browser sends the file only to the RE:FRAME server; the server streams it to Cloudinary and never returns Cloudinary credentials. Vercel Functions cap request bodies at 4.5 MB, so use a Node.js host with a request-body limit above 10 MB for the full upload limit. If deploying on Vercel, cap uploads at 4 MB before release.

## Checks

```powershell
npm test
npm run lint
npm run build
```

## Deployment

### Deploy on Render

The repository includes [`render.yaml`](./render.yaml), a Render Blueprint for a Node.js 24 service in Singapore. It starts with Render’s free compute plan and sets `CLOUDINARY_EVIDENCE_FOLDER` to `reframe/hackindia-demo`, keeping the public demo library separate from the local `reframe/evidence` folder.

1. Push the project to GitHub, then create a Render Blueprint from that repository.
2. During Blueprint setup, enter `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` when Render prompts for them. These values use `sync: false` and are not stored in the repo.
3. Wait for the service to finish building, then open its `onrender.com` URL and verify records, search, and upload.
4. The free web service spins down after 15 minutes without traffic and can take about a minute to start again. Open it shortly before the demo; upgrade the service if a warm, always-on experience is needed. Check current [free plan limitations](https://render.com/docs/free) and [pricing](https://render.com/pricing) before launch.
5. Test an image larger than 4.5 MB on the deployed URL before promising the full 10 MB limit. The app streams uploads through its server, and platform ingress limits vary. If the host rejects that request, deploy on a host confirmed to accept 10 MB request bodies or move to a signed browser-to-Cloudinary upload flow.

Vercel Functions have a 4.5 MB request-body limit ([official limits](https://vercel.com/docs/functions/limitations)). The current 10 MB server upload route will receive a platform-level 413 for larger files there. Use only images below the platform limit, or change the upload architecture before choosing Vercel.

The demo is a single shared workspace without user accounts. The records API lists assets in the configured evidence folder, and Cloudinary delivery URLs are public. Anyone who can open the deployed demo can see those records and request uploads through the server; the current app has no per-user authorization or server-side rate limiter. Use a dedicated Cloudinary account/folder containing only demo-safe material, set an account upload-size limit appropriate for the demo, and do not use private, sensitive, or personally identifying evidence. Before using RE:FRAME for private evidence, add authentication, per-user authorization, and an upload-abuse limit appropriate to the host.

## Demo run of show (about 3 minutes)

1. **0:00–0:25 — The problem:** photo libraries remember when a photo was taken, not what it means.
2. **0:25–1:10 — Capture:** upload a real image of an object or piece of evidence. Show that Cloudinary stores the original while the app processes it.
3. **1:10–1:45 — Understand:** open the visual record and show the actual caption, returned object labels, quality score, metadata, and Cloudinary asset ID. If a model returns no value, say so plainly.
4. **1:45–2:20 — Find:** search for a visible concept, such as `snake` or `person`, and show the result coming from the Cloudinary-backed asset set.
5. **2:20–2:45 — Deliver:** show the optimized Cloudinary image in the result and detail view.
6. **2:45–3:00 — Impact:** connect the workflow to delivery damage, repairs, warranties, rentals, or home maintenance.

Record the final demo only after verifying it against the deployed URL. Keep the final video between 2 and 4 minutes.

## Hackathon submission checklist

- [x] Publish the source to the [public GitHub repository](https://github.com/Ayan3107/reframe) after the final secret scan.
- [ ] Deploy the app and add the public demo URL here.
- [ ] Record and publish a 2–4 minute demo video; add the link here.
- [ ] Complete the HackIndia survey and submission form.
- [ ] Verify the selected track(s), project description, GitHub URL, demo URL, and video URL in the submission.
- [ ] Confirm no credentials, private user images, or local environment files are committed.

See [SUBMISSION.md](./SUBMISSION.md) for a ready-to-edit project description, judging pitch, and timed demo script.

## Current scope and next product work

The working core is upload, Cloudinary analysis, contextual record metadata, Cloudinary-backed search, optimized delivery, persistent collections, and a responsive visual record interface. User accounts, sharing, and record deletion are not represented as working features yet; they should be added only with appropriate access control and recovery behavior.
