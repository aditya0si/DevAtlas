/** @type {import('next').NextConfig} */
const nextConfig = {
  // Firebase Hosting requires a static export of the Next.js app.
  // The Cloud Function `api` serves /api/** routes via rewrites in firebase.json.
  output: 'export',
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },
};

module.exports = nextConfig;
