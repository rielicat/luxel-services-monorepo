import { NextResponse } from 'next/server';

/** Owned redirect: hosts never see the PMS vendor's domain in Luxel's UI, and
 *  the destination stays changeable without touching copy. */
export function GET() {
  return NextResponse.redirect('https://my.hospitable.com/integrations', 302);
}
