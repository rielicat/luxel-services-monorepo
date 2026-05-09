import { FlatCompat } from '@eslint/eslintrc';
import base from './base.mjs';

const compat = new FlatCompat();

export default [
  ...base,
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
];
