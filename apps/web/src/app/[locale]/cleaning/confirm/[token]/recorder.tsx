'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CheckCircle2,
  CircleStop,
  Copy,
  ExternalLink,
  RotateCcw,
  Upload,
  Video,
} from 'lucide-react';
import {
  CLEANING_MEDIA_TICKET_HEADER,
  WALKTHROUGH_MAX_BYTES,
  WALKTHROUGH_MAX_SECONDS,
  isWalkthroughContentType,
} from '@luxel/shared/cleaning-media';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { finishWalkthroughUpload, startWalkthroughUpload } from './actions';
import { dropTake, loadTake, saveTake } from './take-store';

const CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

const LEVELS = [
  { width: 960, height: 540, bits: 800_000, seconds: WALKTHROUGH_MAX_SECONDS },
  {
    width: 640,
    height: 360,
    bits: 400_000,
    seconds: Math.max(60, Math.round(WALKTHROUGH_MAX_SECONDS / 2)),
  },
] as const;

const BYTE_BUDGET = Math.round(WALKTHROUGH_MAX_BYTES * 0.8);
const UPLOAD_TIMEOUT_MS = 300_000;
const TICK_MS = 250;

const IN_APP_UA = /\bwv\b|FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|WhatsApp/i;
const APPLE_UA = /iPhone|iPod|iPad/i;

type Phase = 'idle' | 'preparing' | 'recording' | 'recorded' | 'uploading' | 'uploaded';

type Problem =
  | 'denied'
  | 'busy'
  | 'no_camera'
  | 'unsupported'
  | 'too_large'
  | 'empty'
  | 'failed'
  | 'disabled';

type Sent = 'ok' | 'failed' | 'aborted';

export interface RecorderProps {
  token: string;
  enabled: boolean;
  uploadedBytes: number | null;
  onRecordingChange: (recording: boolean) => void;
  onUploaded: (bytes: number) => void;
}

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const candidate of CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return null;
}

function baseType(mimeType: string): string {
  return mimeType.split(';')[0]!.trim();
}

const megabytes = (bytes: number) => (bytes / 1_000_000).toFixed(1);

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

const minutesOf = (seconds: number) => Math.max(1, Math.round(seconds / 60));

function inAppBrowser(ua: string): boolean {
  if (IN_APP_UA.test(ua)) return true;
  return APPLE_UA.test(ua) && /AppleWebKit/.test(ua) && !/Safari\//.test(ua);
}

function errorName(error: unknown): string {
  return (error as { name?: string } | null)?.name ?? '';
}

function cameraProblem(name: string): Problem {
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'busy';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'no_camera';
  return 'unsupported';
}

function ticketProblem(error: string | undefined): Problem {
  if (error === 'too_large') return 'too_large';
  if (error === 'unavailable') return 'disabled';
  if (error === 'unsupported') return 'unsupported';
  if (error === 'empty') return 'empty';
  return 'failed';
}

async function openCamera(
  level: (typeof LEVELS)[number],
): Promise<
  { stream: MediaStream; problem?: undefined } | { stream?: undefined; problem: Problem }
> {
  try {
    return {
      stream: await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: level.width },
          height: { ideal: level.height },
          aspectRatio: { ideal: 16 / 9 },
          frameRate: { ideal: 12, max: 15 },
        },
      }),
    };
  } catch (error) {
    const name = errorName(error);
    if (name !== 'OverconstrainedError' && name !== 'ConstraintNotSatisfiedError') {
      return { problem: cameraProblem(name) };
    }
  }
  try {
    return { stream: await navigator.mediaDevices.getUserMedia({ audio: false, video: true }) };
  } catch (error) {
    return { problem: cameraProblem(errorName(error)) };
  }
}

function putWithProgress(
  url: string,
  ticket: string | undefined,
  blob: Blob,
  contentType: string,
  onProgress: (percent: number) => void,
  hold: (xhr: XMLHttpRequest | null) => void,
): Promise<Sent> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader('content-type', contentType);
    if (ticket) xhr.setRequestHeader(CLEANING_MEDIA_TICKET_HEADER, ticket);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    const settle = (result: Sent) => {
      hold(null);
      resolve(result);
    };
    xhr.onload = () => settle(xhr.status >= 200 && xhr.status < 300 ? 'ok' : 'failed');
    xhr.onerror = () => settle('failed');
    xhr.ontimeout = () => settle('failed');
    xhr.onabort = () => settle('aborted');
    hold(xhr);
    xhr.send(blob);
  });
}

function uploadTarget(uploadUrl: string, ticket: string | undefined): [string, string | undefined] {
  if (!ticket) return [uploadUrl, undefined];
  try {
    const url = new URL(uploadUrl);
    url.searchParams.delete('ticket');
    return [url.toString(), ticket];
  } catch {
    return [uploadUrl, undefined];
  }
}

export function WalkthroughRecorder({
  token,
  enabled,
  uploadedBytes,
  onRecordingChange,
  onUploaded,
}: RecorderProps) {
  const t = useTranslations('crew.video');
  const [supported, setSupported] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>(uploadedBytes === null ? 'idle' : 'uploaded');
  const [elapsed, setElapsed] = useState(0);
  const [percent, setPercent] = useState(0);
  const [bytes, setBytes] = useState<number | null>(uploadedBytes);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [level, setLevel] = useState(0);
  const [inApp, setInApp] = useState(false);
  const [pageUrl, setPageUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const takenBytesRef = useRef(0);
  const blobRef = useRef<{ blob: Blob; contentType: string; seconds: number } | null>(null);
  const previewRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const startedAtRef = useRef(0);
  const phaseRef = useRef<Phase>(phase);

  const shot = LEVELS[Math.min(level, LEVELS.length - 1)]!;

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    onRecordingChange(
      phase === 'preparing' ||
        phase === 'recording' ||
        phase === 'recorded' ||
        phase === 'uploading',
    );
  }, [onRecordingChange, phase]);

  useEffect(() => {
    setSupported(
      typeof navigator !== 'undefined' &&
        Boolean(navigator.mediaDevices?.getUserMedia) &&
        pickMimeType() !== null,
    );
    setInApp(typeof navigator !== 'undefined' && inAppBrowser(navigator.userAgent));
    setPageUrl(window.location.href);
  }, []);

  const showTake = useCallback((blob: Blob) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = URL.createObjectURL(blob);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = previewRef.current;
    }
  }, []);

  useEffect(() => {
    if (uploadedBytes !== null) return;
    let live = true;
    void loadTake(token).then((take) => {
      if (!live || !take || phaseRef.current !== 'idle' || blobRef.current) return;
      blobRef.current = take;
      setBytes(take.blob.size);
      showTake(take.blob);
      setPhase('recorded');
    });
    return () => {
      live = false;
    };
  }, [showTake, token, uploadedBytes]);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(
    () => () => {
      stopTimer();
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [stopTimer],
  );

  useEffect(() => {
    const unsent = phase === 'recording' || phase === 'recorded' || phase === 'uploading';
    if (!unsent) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = t('unsent');
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [phase, t]);

  const stop = useCallback(() => {
    stopTimer();
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, [stopTimer]);

  const start = useCallback(async () => {
    setProblem(null);
    setCopied(false);
    setPhase('preparing');
    const mimeType = pickMimeType();
    if (!mimeType) {
      setSupported(false);
      setPhase(blobRef.current ? 'recorded' : 'idle');
      return;
    }
    const opened = await openCamera(shot);
    if (!opened.stream) {
      setProblem(opened.problem);
      setPhase(blobRef.current ? 'recorded' : 'idle');
      return;
    }
    const stream = opened.stream;
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.removeAttribute('src');
      videoRef.current.srcObject = stream;
      videoRef.current.muted = true;
      await videoRef.current.play().catch(() => {});
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: shot.bits });
    } catch {
      releaseStream();
      setSupported(false);
      setPhase(blobRef.current ? 'recorded' : 'idle');
      return;
    }
    recorderRef.current = recorder;
    chunksRef.current = [];
    takenBytesRef.current = 0;
    blobRef.current = null;
    void dropTake(token);
    let cutShort = false;

    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      chunksRef.current.push(event.data);
      takenBytesRef.current += event.data.size;
      const seconds = (Date.now() - startedAtRef.current) / 1000;
      const heavy = takenBytesRef.current >= BYTE_BUDGET;
      if (heavy) cutShort = true;
      if (heavy || seconds >= shot.seconds) stop();
    };

    recorder.onstop = () => {
      const contentType = baseType(mimeType);
      const blob = new Blob(chunksRef.current, { type: contentType });
      chunksRef.current = [];
      const seconds = Math.round((Date.now() - startedAtRef.current) / 1000);
      releaseStream();
      if (!blob.size) {
        blobRef.current = null;
        setBytes(null);
        setProblem('empty');
        setPhase('idle');
        return;
      }
      setBytes(blob.size);
      showTake(blob);
      if (cutShort) setLevel((current) => Math.min(current + 1, LEVELS.length - 1));
      if (blob.size > WALKTHROUGH_MAX_BYTES || !isWalkthroughContentType(contentType)) {
        blobRef.current = null;
        setLevel((current) => Math.min(current + 1, LEVELS.length - 1));
        setProblem(blob.size > WALKTHROUGH_MAX_BYTES ? 'too_large' : 'unsupported');
        setPhase('idle');
        return;
      }
      blobRef.current = { blob, contentType, seconds };
      void saveTake(token, { blob, contentType, seconds });
      setPhase('recorded');
    };

    startedAtRef.current = Date.now();
    setElapsed(0);
    recorder.start(1_000);
    setPhase('recording');
    timerRef.current = setInterval(() => {
      const seconds = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(seconds);
      if (seconds >= shot.seconds) stop();
    }, TICK_MS);
  }, [releaseStream, shot, showTake, stop, token]);

  const cancelUpload = useCallback(() => {
    xhrRef.current?.abort();
  }, []);

  const upload = useCallback(async () => {
    const pending = blobRef.current;
    if (!pending) return;
    setProblem(null);
    setPercent(0);
    setPhase('uploading');
    const ticket = await startWalkthroughUpload(token, pending.contentType, pending.blob.size);
    if (!ticket.ok || !ticket.uploadUrl || !ticket.key) {
      setProblem(ticketProblem(ticket.error));
      setPhase('recorded');
      return;
    }
    const [url, header] = uploadTarget(ticket.uploadUrl, ticket.ticket);
    const sent = await putWithProgress(
      url,
      header,
      pending.blob,
      pending.contentType,
      setPercent,
      (xhr) => {
        xhrRef.current = xhr;
      },
    );
    if (sent !== 'ok') {
      setProblem(sent === 'aborted' ? null : 'failed');
      setPhase('recorded');
      return;
    }
    const recorded = await finishWalkthroughUpload(
      token,
      ticket.key,
      pending.blob.size,
      pending.seconds,
      null,
    );
    if (!recorded.ok) {
      setProblem('failed');
      setPhase('recorded');
      return;
    }
    blobRef.current = null;
    void dropTake(token);
    setPhase('uploaded');
    onUploaded(pending.blob.size);
  }, [onUploaded, token]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, []);

  if (!enabled) return <p className="text-muted-foreground text-sm">{t('disabled')}</p>;

  const blocked = supported === false;
  const canRecord = !blocked;
  const showEscape =
    inApp ||
    blocked ||
    problem === 'denied' ||
    problem === 'unsupported' ||
    problem === 'no_camera';

  return (
    <div className="grid gap-3">
      {canRecord && (
        <>
          <p className="text-muted-foreground text-sm">
            {t('hint', { minutes: minutesOf(shot.seconds) })}
          </p>

          <video
            ref={videoRef}
            playsInline
            muted
            controls={phase === 'recorded' || phase === 'uploading'}
            className="bg-muted aspect-video w-full rounded-xl object-cover"
          />
        </>
      )}

      {phase === 'recording' && (
        <p className="text-primary text-sm font-semibold">
          {t('recording', { elapsed: clock(elapsed) })}
        </p>
      )}
      {phase !== 'recording' && bytes !== null && phase !== 'uploaded' && (
        <p className="text-muted-foreground text-sm">{t('size', { size: megabytes(bytes) })}</p>
      )}
      {canRecord && level > 0 && phase !== 'uploaded' && (
        <p className="text-muted-foreground text-sm">{t('shorter')}</p>
      )}

      {canRecord && phase === 'idle' && (
        <Button size="lg" onClick={start}>
          <Video className="h-5 w-5" /> {t('start')}
        </Button>
      )}
      {phase === 'preparing' && (
        <Button size="lg" disabled>
          {t('preparing')}
        </Button>
      )}
      {phase === 'recording' && (
        <Button size="lg" variant="destructive" onClick={stop}>
          <CircleStop className="h-5 w-5" /> {t('stop')}
        </Button>
      )}
      {phase === 'recorded' && (
        <div className="grid gap-2">
          <Button size="lg" onClick={upload}>
            <Upload className="h-5 w-5" /> {problem === 'failed' ? t('retry') : t('upload')}
          </Button>
          {canRecord && (
            <Button size="lg" variant="outline" onClick={start}>
              <RotateCcw className="h-5 w-5" /> {t('again')}
            </Button>
          )}
        </div>
      )}
      {phase === 'uploading' && (
        <div className="grid gap-2">
          <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
            <div className="bg-primary h-full transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-muted-foreground text-sm">{t('uploading', { percent })}</p>
          <Button size="lg" variant="outline" onClick={cancelUpload}>
            {t('cancel')}
          </Button>
        </div>
      )}
      {phase === 'uploaded' && (
        <p className="text-success flex items-center gap-2 text-sm font-semibold">
          <CheckCircle2 className="h-5 w-5" />
          {bytes === null ? t('uploaded') : t('done', { size: megabytes(bytes) })}
        </p>
      )}

      {problem === 'too_large' && (
        <p className="text-warning text-sm">{t('tooLarge', { size: megabytes(bytes ?? 0) })}</p>
      )}
      {problem === 'empty' && <p className="text-warning text-sm">{t('emptyTake')}</p>}
      {problem === 'failed' && <p className="text-warning text-sm">{t('failed')}</p>}
      {problem === 'disabled' && <p className="text-warning text-sm">{t('disabled')}</p>}
      {problem === 'denied' && <p className="text-warning text-sm">{t('denied')}</p>}
      {problem === 'busy' && <p className="text-warning text-sm">{t('busy')}</p>}
      {problem === 'no_camera' && <p className="text-warning text-sm">{t('noCamera')}</p>}
      {(blocked || problem === 'unsupported') && (
        <p className="text-warning text-sm">{t('unsupported')}</p>
      )}

      {showEscape && (
        <div className="border-warning/40 bg-warning/5 grid gap-2 rounded-xl border p-3">
          <p className="flex items-start gap-2 text-sm font-semibold">
            <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" /> {t('openBrowser')}
          </p>
          <Input
            readOnly
            value={pageUrl}
            aria-label={t('link')}
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button type="button" variant="outline" onClick={copyLink}>
            <Copy className="h-4 w-4" /> {copied ? t('copied') : t('copyLink')}
          </Button>
        </div>
      )}
    </div>
  );
}
