import type { Metadata } from 'next';
import { termsDoc } from '@luxel/shared/terms';
import {
  LegalPage,
  legalLanguageAlternates,
  pickLegalLang,
  type LegalSearchParams,
} from '@/components/legal/legal-page';

export const dynamic = 'force-dynamic';

const BASE_PATH = '/terms';
const SIBLING_PATH = '/privacy';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: LegalSearchParams;
}): Promise<Metadata> {
  const doc = termsDoc(await pickLegalLang(searchParams));
  return {
    title: doc.meta_title,
    description: doc.meta_description,
    alternates: {
      canonical: '/terms',
      languages: legalLanguageAlternates(BASE_PATH),
    },
  };
}

export default async function TermsPage({ searchParams }: { searchParams: LegalSearchParams }) {
  const lang = await pickLegalLang(searchParams);
  return (
    <LegalPage doc={termsDoc(lang)} lang={lang} basePath={BASE_PATH} siblingPath={SIBLING_PATH} />
  );
}
