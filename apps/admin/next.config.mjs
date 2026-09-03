import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@luxel/shared', '@luxel/core'],
  poweredByHeader: false,
  typedRoutes: true,
};

export default withNextIntl(nextConfig);
