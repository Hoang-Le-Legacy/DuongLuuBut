/** Zod schemas shared by every API route. Validate at every boundary. */
'use strict';

const { z } = require('zod');

const MM_DD_YY = /^(\d{2})-(\d{2})-(\d{2})$/;

/** `mm-dd-yy` (as the UI shows it) -> `yyyy-mm-dd` (as Postgres `date` wants it). */
const dateField = z
  .string()
  .regex(MM_DD_YY, 'date must be mm-dd-yy')
  .transform((v) => {
    const [, mm, dd, yy] = MM_DD_YY.exec(v);
    return `20${yy}-${mm}-${dd}`;
  })
  .nullable()
  .optional();

const imageInput = z.object({
  // Not a strict URL: this is our own same-origin proxy path
  // (`/api/photo?p=...`), not an absolute Blob URL — see api/photo.js.
  url: z.string().min(1).max(2048),
  pathname: z.string().min(1).max(2048),
  position: z.number().int().min(0).max(4)
});

const imagesField = z.array(imageInput).max(5, 'up to 5 photos per message').optional();

const entryInput = z.object({
  sender: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(4000),
  date: dateField,
  isPrivate: z.boolean().optional().default(false),
  images: imagesField
});

const entryUpdate = z.object({
  sender: z.string().trim().min(1).max(80).optional(),
  message: z.string().trim().min(1).max(4000).optional(),
  date: dateField,
  isPrivate: z.boolean().optional(),
  images: imagesField
});

const unlockInput = z.object({
  password: z.string().min(1).max(200)
});

// Guest submission via a shared contribute link. No `isPrivate` — the
// server always forces new contributions private (see api/contribute.js).
const contributeInput = z.object({
  token: z.string().min(1).max(200),
  sender: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(4000),
  date: dateField,
  images: imagesField
});

const passwordChangeInput = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(4).max(200)
});

const ALLOWED_IMAGE_MIME = /^data:image\/(jpeg|jpg|png|webp|gif);base64,/;

const uploadInput = z.object({
  image: z.string().regex(ALLOWED_IMAGE_MIME, 'unsupported image type'),
  // Present when a guest (no admin bearer token) is uploading via a
  // contribute link — see api/upload.js and api/contribute.js.
  contributeToken: z.string().min(1).max(200).optional()
});

module.exports = {
  entryInput,
  entryUpdate,
  unlockInput,
  passwordChangeInput,
  contributeInput,
  uploadInput,
  ALLOWED_IMAGE_MIME
};
