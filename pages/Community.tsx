import React from 'react';
import { Linkedin, Loader2, Heart } from 'lucide-react';
import { usePublicCommunityMembers } from '../services/queries';
import type { CommunityMember } from '../types';
import { initialsFromName } from './Admin.community.helpers';

const Community: React.FC = () => {
  const { data: members = [], isLoading, error } = usePublicCommunityMembers();

  return (
    <div className="bg-canvas min-h-screen">
      {/* Hero */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 pb-12 sm:pt-24 sm:pb-16">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-amber-acc-2 font-semibold">
          The community
        </p>
        <h1 className="mt-3 font-display text-4xl sm:text-5xl font-semibold tracking-tight text-gray-900">
          Tax leaders behind the benchmark
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-gray-600 leading-relaxed">
          The benchmark is only as honest as the people behind it. Meet the practitioners,
          technologists, and leaders who have agreed to be publicly listed as members of the
          taxbenchmark.ai community.
        </p>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-24">
        {isLoading ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 flex items-center justify-center text-gray-500 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading members…
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
            <p className="text-gray-500 font-medium">Could not load community members right now.</p>
          </div>
        ) : members.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
            <Heart className="h-10 w-10 text-amber-acc mx-auto mb-4" />
            <p className="text-gray-600 font-medium max-w-md mx-auto leading-relaxed">
              We're just getting started. The first community members will appear here soon.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
            {members.map(m => (
              <MemberCard key={m.id} member={m} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

/** Small inline company logo. Hides itself on load error so a 404'd
 *  favicon doesn't leave a broken-image icon on the card. */
const CompanyLogo: React.FC<{ src: string }> = ({ src }) => {
  const [failed, setFailed] = React.useState(false);
  if (failed) return null;
  return (
    <img
      src={src}
      alt=""
      className="w-4 h-4 rounded-sm object-contain flex-shrink-0"
      onError={() => setFailed(true)}
    />
  );
};

const MemberCard: React.FC<{ member: CommunityMember }> = ({ member: m }) => {
  return (
    <li className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow border border-gray-100 p-6 flex flex-col">
      <div className="flex items-start gap-4">
        {m.photo_url ? (
          <img
            src={m.photo_url}
            alt={m.name}
            className="h-16 w-16 rounded-full object-cover border border-gray-200 flex-shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-indigo-50 text-primary flex items-center justify-center font-display text-lg font-semibold border border-indigo-100 flex-shrink-0">
            {initialsFromName(m.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold text-gray-900 leading-tight truncate">
            {m.name}
          </h3>
          {m.role && (
            <p className="mt-1 text-sm text-gray-700 font-medium leading-snug">{m.role}</p>
          )}
          {m.company && (
            <p className="text-sm text-gray-500 leading-snug truncate flex items-center gap-1.5">
              {m.company_logo_url && (
                <CompanyLogo src={m.company_logo_url} />
              )}
              {m.company}
            </p>
          )}
        </div>
      </div>
      {m.linkedin_url && (
        <a
          href={m.linkedin_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-primary transition-colors self-start"
        >
          <Linkedin className="h-3.5 w-3.5" /> LinkedIn
        </a>
      )}
    </li>
  );
};

export default Community;
