import type { Metadata } from 'next';
import { privacyDoc } from '@luxel/shared/privacy';
import {
  LegalPage,
  legalLanguageAlternates,
  pickLegalLang,
  type LegalSearchParams,
} from '@/components/legal/legal-page';

export const dynamic = 'force-dynamic';

const BASE_PATH = '/privacy';
const SIBLING_PATH = '/terms';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: LegalSearchParams;
}): Promise<Metadata> {
  const doc = privacyDoc(await pickLegalLang(searchParams));
  return {
    title: doc.meta_title,
    description: doc.meta_description,
    alternates: {
      canonical: '/privacy',
      languages: legalLanguageAlternates(BASE_PATH),
    },
  };
}

export default async function PrivacyPage({ searchParams }: { searchParams: LegalSearchParams }) {
  const lang = await pickLegalLang(searchParams);
  return (
    <LegalPage doc={privacyDoc(lang)} lang={lang} basePath={BASE_PATH} siblingPath={SIBLING_PATH} />
  );
}
