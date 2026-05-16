import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  CheckCircle2, XCircle, Loader2, AlertCircle, Linkedin, Upload, Heart, ImageOff,
} from 'lucide-react';
import { supabase } from '../services/api';
import type {
  CommunityMemberInvitePreview, CommunityMemberSelfDraft,
} from '../types';
import {
  parseTokenFromSearch, parseDeclineIntent,
  validatePhoto, errorMessageForStatus,
} from './ConfirmMember.helpers';

type Stage =
  | { kind: 'loading' }
  | { kind: 'form'; preview: CommunityMemberInvitePreview }
  | { kind: 'decline-confirm'; preview: CommunityMemberInvitePreview }
  | { kind: 'submitting'; intent: 'confirm' | 'decline' }
  | { kind: 'done'; status: 'confirmed' | 'declined' }
  | { kind: 'error'; message: string };

const ConfirmMember: React.FC = () => {
  const { search } = useLocation();
  const token = parseTokenFromSearch(search);
  const declineIntent = parseDeclineIntent(search);

  const [stage, setStage] = useState<Stage>({ kind: 'loading' });
  const [draft, setDraft] = useState<CommunityMemberSelfDraft>({
    name: '', role: '', company: '', linkedin_url: '', photo_url: '',
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStage({ kind: 'error', message: 'No invite token in the URL. The link in your email may have been broken — try opening it directly.' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch('/api/community/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const body = await resp.json().catch(() => ({}));
        if (cancelled) return;
        if (!resp.ok) {
          setStage({ kind: 'error', message: errorMessageForStatus(resp.status, body?.error) });
          return;
        }
        const preview = body as CommunityMemberInvitePreview;
        setDraft({
          name: preview.name || '',
          role: preview.role || '',
          company: preview.company || '',
          linkedin_url: preview.linkedin_url || '',
          photo_url: preview.photo_url || '',
        });
        setStage({
          kind: declineIntent ? 'decline-confirm' : 'form',
          preview,
        });
      } catch (e: any) {
        if (!cancelled) setStage({ kind: 'error', message: e?.message || 'Network error.' });
      }
    })();
    return () => { cancelled = true; };
  }, [token, declineIntent]);

  const handlePhotoChange = (file: File | null) => {
    setPhotoError(null);
    if (!file) {
      setPhotoFile(null);
      return;
    }
    const validation = validatePhoto(file);
    if (!validation.ok) {
      setPhotoError(validation.reason);
      setPhotoFile(null);
      return;
    }
    setPhotoFile(file);
  };

  /** Uploads the picked photo via signed URL, returns the public URL to save. */
  const uploadPhotoIfPicked = async (): Promise<string | null> => {
    if (!photoFile || !token) return null;
    const validation = validatePhoto(photoFile);
    if (!validation.ok) {
      setPhotoError(validation.reason);
      return null;
    }
    const urlResp = await fetch('/api/community/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ext: validation.ext }),
    });
    const urlBody = await urlResp.json().catch(() => ({}));
    if (!urlResp.ok) {
      throw new Error(urlBody?.error || `Could not get upload URL (HTTP ${urlResp.status})`);
    }
    const { path, signedToken, publicUrl } = urlBody as { path: string; signedToken: string; publicUrl: string };
    const { error: uploadErr } = await supabase.storage
      .from('community-photos')
      .uploadToSignedUrl(path, signedToken, photoFile);
    if (uploadErr) throw new Error(uploadErr.message);
    return publicUrl;
  };

  const handleConfirm = async () => {
    if (!token || stage.kind !== 'form') return;
    if (!draft.name.trim()) {
      setStage({ ...stage }); // no-op; the input itself will surface the required attr
      return;
    }
    setStage({ kind: 'submitting', intent: 'confirm' });
    try {
      let photoUrl: string | null = draft.photo_url || null;
      if (photoFile) {
        photoUrl = await uploadPhotoIfPicked();
      }
      const resp = await fetch('/api/community/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          action: 'confirm',
          name: draft.name,
          role: draft.role,
          company: draft.company,
          linkedin_url: draft.linkedin_url,
          photo_url: photoUrl,
        }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setStage({ kind: 'error', message: errorMessageForStatus(resp.status, body?.error) });
        return;
      }
      setStage({ kind: 'done', status: 'confirmed' });
    } catch (e: any) {
      setStage({ kind: 'error', message: e?.message || 'Could not save your response.' });
    }
  };

  const handleDecline = async () => {
    if (!token) return;
    setStage({ kind: 'submitting', intent: 'decline' });
    try {
      const resp = await fetch('/api/community/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'decline' }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setStage({ kind: 'error', message: errorMessageForStatus(resp.status, body?.error) });
        return;
      }
      setStage({ kind: 'done', status: 'declined' });
    } catch (e: any) {
      setStage({ kind: 'error', message: e?.message || 'Could not save your response.' });
    }
  };

  return (
    <div className="bg-canvas min-h-screen">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 pt-12 pb-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-amber-acc-2 font-semibold">
          Community invite
        </p>
        <h1 className="mt-3 font-display text-3xl sm:text-4xl font-semibold tracking-tight text-gray-900">
          Join the taxbenchmark.ai community
        </h1>

        <div className="mt-8">
          {stage.kind === 'loading' && <LoadingPanel />}
          {stage.kind === 'error' && <ErrorPanel message={stage.message} />}
          {stage.kind === 'done' && <DonePanel status={stage.status} />}
          {stage.kind === 'submitting' && <SubmittingPanel intent={stage.intent} />}

          {stage.kind === 'form' && (
            <FormPanel
              preview={stage.preview}
              draft={draft}
              setDraft={setDraft}
              photoFile={photoFile}
              photoError={photoError}
              onPhotoChange={handlePhotoChange}
              onConfirm={handleConfirm}
              onDecline={() => setStage({ kind: 'decline-confirm', preview: stage.preview })}
            />
          )}

          {stage.kind === 'decline-confirm' && (
            <DeclineConfirmPanel
              preview={stage.preview}
              onCancel={() => setStage({ kind: 'form', preview: stage.preview })}
              onConfirmDecline={handleDecline}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Sub-panels ──────────────────────────────────────────────────────────────

const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">{children}</div>
);

const LoadingPanel: React.FC = () => (
  <Panel>
    <div className="flex items-center gap-3 text-gray-500 font-medium">
      <Loader2 className="h-5 w-5 animate-spin" /> Loading your invite…
    </div>
  </Panel>
);

const ErrorPanel: React.FC<{ message: string }> = ({ message }) => (
  <Panel>
    <div className="flex items-start gap-4">
      <AlertCircle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
      <div>
        <h2 className="font-display text-lg font-semibold text-gray-900">We couldn't open this invite</h2>
        <p className="text-sm text-gray-600 mt-2 leading-relaxed">{message}</p>
        <Link to="/" className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline">
          ← Back to taxbenchmark.ai
        </Link>
      </div>
    </div>
  </Panel>
);

const SubmittingPanel: React.FC<{ intent: 'confirm' | 'decline' }> = ({ intent }) => (
  <Panel>
    <div className="flex items-center gap-3 text-gray-700 font-medium">
      <Loader2 className="h-5 w-5 animate-spin text-primary" />
      {intent === 'confirm' ? 'Publishing your listing…' : 'Saving your response…'}
    </div>
  </Panel>
);

const DonePanel: React.FC<{ status: 'confirmed' | 'declined' }> = ({ status }) => (
  <Panel>
    <div className="flex items-start gap-4">
      {status === 'confirmed' ? (
        <CheckCircle2 className="h-7 w-7 text-green-600 flex-shrink-0 mt-0.5" />
      ) : (
        <Heart className="h-7 w-7 text-amber-acc flex-shrink-0 mt-0.5" />
      )}
      <div>
        <h2 className="font-display text-xl font-semibold text-gray-900">
          {status === 'confirmed' ? "You're in." : "Thanks for letting us know."}
        </h2>
        <p className="text-sm text-gray-600 mt-2 leading-relaxed">
          {status === 'confirmed'
            ? "Your listing is now live. Visit the community page to see it alongside everyone else."
            : "We won't list you on the community page. If you change your mind, just ask the admin to send a fresh invite."}
        </p>
        {status === 'confirmed' && (
          <Link to="/community" className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:bg-indigo-900 transition-all">
            See the community page →
          </Link>
        )}
      </div>
    </div>
  </Panel>
);

interface FormPanelProps {
  preview: CommunityMemberInvitePreview;
  draft: CommunityMemberSelfDraft;
  setDraft: (d: CommunityMemberSelfDraft) => void;
  photoFile: File | null;
  photoError: string | null;
  onPhotoChange: (f: File | null) => void;
  onConfirm: () => void;
  onDecline: () => void;
}

const FormPanel: React.FC<FormPanelProps> = ({
  preview, draft, setDraft, photoFile, photoError, onPhotoChange, onConfirm, onDecline,
}) => {
  const previewPhoto = photoFile ? URL.createObjectURL(photoFile) : draft.photo_url || '';

  return (
    <Panel>
      <p className="text-sm text-gray-600 leading-relaxed">
        You're being invited to be listed on the public{' '}
        <Link to="/community" className="text-primary font-semibold hover:underline">community page</Link>.
        Review the details below, edit anything you'd like to show differently, then confirm.
      </p>
      <p className="mt-3 text-xs text-gray-500 font-medium">
        Inviting: <span className="font-mono text-gray-700">{preview.email}</span>
      </p>

      <form
        onSubmit={(e) => { e.preventDefault(); onConfirm(); }}
        className="mt-8 space-y-5"
      >
        <Field label="Name *">
          <input
            required
            type="text"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Role">
            <input
              type="text"
              value={draft.role || ''}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              placeholder="VP of Tax Technology"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
            />
          </Field>
          <Field label="Company">
            <input
              type="text"
              value={draft.company || ''}
              onChange={(e) => setDraft({ ...draft, company: e.target.value })}
              placeholder="Acme Corp"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
            />
          </Field>
        </div>
        <Field label="LinkedIn URL (optional)">
          <div className="relative">
            <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={draft.linkedin_url || ''}
              onChange={(e) => setDraft({ ...draft, linkedin_url: e.target.value })}
              placeholder="linkedin.com/in/your-handle"
              className="w-full rounded-xl border border-gray-200 pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none"
            />
          </div>
        </Field>

        <PhotoField
          previewSrc={previewPhoto}
          fileName={photoFile?.name || null}
          error={photoError}
          onChange={onPhotoChange}
        />

        <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          <button
            type="button"
            onClick={onDecline}
            className="px-4 py-3 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors"
          >
            Decline this invite
          </button>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:bg-indigo-900 active:scale-95 transition-all"
          >
            <CheckCircle2 className="h-4 w-4" /> Confirm and publish
          </button>
        </div>
      </form>
    </Panel>
  );
};

interface PhotoFieldProps {
  previewSrc: string;
  fileName: string | null;
  error: string | null;
  onChange: (file: File | null) => void;
}

const PhotoField: React.FC<PhotoFieldProps> = ({ previewSrc, fileName, error, onChange }) => {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <Field label="Photo (optional)">
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
          {previewSrc && !imgFailed ? (
            <img src={previewSrc} alt="" className="h-full w-full object-cover" onError={() => setImgFailed(true)} />
          ) : (
            <ImageOff className="h-6 w-6 text-gray-300" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-100 cursor-pointer">
            <Upload className="h-4 w-4" />
            {fileName ? 'Replace photo' : 'Upload photo'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                setImgFailed(false);
                onChange(e.target.files?.[0] || null);
              }}
            />
          </label>
          {fileName && (
            <p className="mt-2 text-xs text-gray-500 truncate">Picked: {fileName}</p>
          )}
          {error && (
            <p className="mt-2 text-xs text-red-600 font-medium">{error}</p>
          )}
        </div>
      </div>
    </Field>
  );
};

interface DeclineConfirmProps {
  preview: CommunityMemberInvitePreview;
  onCancel: () => void;
  onConfirmDecline: () => void;
}

const DeclineConfirmPanel: React.FC<DeclineConfirmProps> = ({ preview, onCancel, onConfirmDecline }) => (
  <Panel>
    <div className="flex items-start gap-4">
      <XCircle className="h-6 w-6 text-gray-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <h2 className="font-display text-lg font-semibold text-gray-900">Decline this invite?</h2>
        <p className="text-sm text-gray-600 mt-2 leading-relaxed">
          We won't list <span className="font-semibold">{preview.email}</span> on the community page.
          You can always ask the admin to send a fresh invite later if you change your mind.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={onConfirmDecline}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-100 border border-gray-200 text-gray-800 rounded-xl font-bold text-sm hover:bg-gray-200"
          >
            <XCircle className="h-4 w-4" /> Yes, decline
          </button>
          <button
            onClick={onCancel}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:bg-indigo-900"
          >
            Go back to the form
          </button>
        </div>
      </div>
    </div>
  </Panel>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{label}</span>
    {children}
  </label>
);

export default ConfirmMember;
