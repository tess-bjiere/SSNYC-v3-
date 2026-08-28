/** @type {import('next').NextConfig} */
const nextConfig = {
  // Reference images are remote (Supabase storage / external URLs). We render them
  // with plain <img> tags, so no next/image remote config is required.
  reactStrictMode: true,

  // nodemailer is a CommonJS package with dynamic requires; keep it out of the
  // bundle so the SMTP mailer works in the server-action runtime (Tess,
  // 2026-08-26: send comment notifications through Google Workspace SMTP, no DNS).
  serverExternalPackages: ["nodemailer"],

  experimental: {
    serverActions: {
      // Uploads go through a Server Action, and Next caps those request bodies at
      // 1 MB by default — small enough that an ordinary reference photo fails. The
      // uploader sends one image per request, so this only has to clear a single
      // full-size photo plus its thumbnail. Keep MAX_UPLOAD_BYTES in
      // lib/uploadLimits.ts in step with this number.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
