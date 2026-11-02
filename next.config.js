/** @type {import('next').NextConfig} */
// Same setup as Spello: a static export that can be hosted on GitHub Pages
// (https://evecui250.github.io/laizhuiju/) and later wrapped with Capacitor
// for TestFlight. Set BASE_PATH='' to serve it from a domain root instead.
const basePath = process.env.BASE_PATH ?? '/laizhuiju';

module.exports = {
  output: 'export',
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};
