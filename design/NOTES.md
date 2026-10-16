# Figma design notes (transcribed from screenshots)

Global: white background, Inter-like sans, small type (~12–13px). Primary green ~#169C34,
mint highlight ~#E3F4E6, input fill ~#F1F4F3, light grey borders, rounded corners (6–8px).
Logo "ONB" in a pixel font (e.g. Silkscreen).

## Login
- Centered card, thin light border, rounded.
- Bold "Login" heading.
- Mint "Login with Google" button with Google G icon (real Google OAuth).
- Divider with "or sign up through email" (small grey).
- "Email ID" and "Password" inputs: grey fill, no border.
- Solid green full-width "Login" button.

## Homepage (inbox layout) — shared shell
- Left sidebar (~130px): ONB logo; user card (avatar, name, email, chevron → dropdown with Logout);
  green-outlined "Compose" button; "CORE" section label; nav items "Scheduled" (clock icon) and
  "Sent" (paper-plane icon) with count badges; active item has mint background.
- Main: rounded grey search bar (Elasticsearch-backed), filter icon, refresh icon.
- Rows separated by thin lines: `To: <name>` | pill | **Subject** - grey body preview (ellipsis) | star icon.

### Scheduled tab
- Pill: orange/peach with clock icon + time, e.g. "Tue 9:15:12 AM".

### Sent tab
- Pill: small grey "Sent". (Addition: red "Failed" pill + sent time, required by spec.)

## Email detail
- Header: ← back, subject (large), right side: star, archive, delete icons, divider, user avatar.
- Sender row: round green avatar w/ initial, bold name, <email> in grey, "to me ⌄", date right ("Nov 3, 10:23 AM").
- Body: rich HTML (sanitized). Attachments as image thumbnail cards (name + size) — optional.

## Compose New Email (full page)
- Header: ← "Compose New Email"; right: paperclip (attach — used for CSV leads upload),
  clock (opens "Send Later" popover), green-outlined "Send" button.
- Fields (label left, borderless input with bottom divider):
  - From: dropdown pill (sender account, e.g. oliver.brown@domain.io)
  - To: recipient@example.com (chips; populated from CSV upload, show count detected)
  - Subject
  - "Delay between 2 emails" [00] and "Hourly Limit" [00] small boxed inputs
- Body: grey-filled rich text editor, placeholder "Type Your Reply...", toolbar:
  undo/redo | text size | B I U | align | ordered/unordered list, indent/outdent, quote, ... | strikethrough.
- "Send Later" popover: title, "Pick date & time" input w/ calendar icon, presets
  ("Tomorrow", "Tomorrow, 10:00 AM", "Tomorrow, 11:00 AM", "Tomorrow, 3:00 PM"),
  Cancel (text) + Done (green-outlined).

### Compose variants (scheduled state)
- Header button becomes green-outlined "Send Later" once a time is picked; paperclip turns green
  with a small badge when an attachment is added.
- "To" row has a green "⤒ Upload List" link at the right end → CSV/text leads upload.
- After upload: recipients shown as green-outlined chips (first 3) + "+N" chip for the rest.
- Attachment thumbnails appear below the editor (image card).
