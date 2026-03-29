import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, TrendingUp, Users } from 'lucide-react';
import { User } from '../types';

interface HomeProps {
    user: User | null;
}

const Home: React.FC<HomeProps> = ({ user }) => {
  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-primary pb-32 pt-16 lg:pb-40 lg:pt-24">
        <div className="relative mx-auto max-w-7xl px-4 sm:static sm:px-6 lg:px-8">
          <div className="sm:max-w-lg">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
              Indirect Tax Technology Benchmark
            </h1>
            <p className="mt-4 text-xl text-indigo-100">
              Compare your organizational model, automation rates, and AI adoption against industry peers.
            </p>
            <div className="mt-10">
              {!user ? (
                <div className="inline-block rounded-md border border-transparent bg-secondary px-8 py-3 text-center font-medium text-white hover:bg-indigo-600">
                  Login to Participate
                </div>
              ) : (
                <Link
                  to="/survey"
                  className="inline-flex items-center gap-2 rounded-md border border-transparent bg-white px-8 py-3 text-center font-medium text-primary hover:bg-gray-100"
                >
                  Start Survey <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Feature Grid */}
      <div className="relative -mt-24 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {[
            { icon: <TrendingUp className="h-6 w-6" />, title: 'Automation Metrics', desc: 'Benchmark your tax calculation, payment, and compliance automation rates against the market.' },
            { icon: <Users className="h-6 w-6" />, title: 'Team Structure', desc: 'Understand how peer organizations structure their tax technology vs. tax business teams.' },
            { icon: <CheckCircle2 className="h-6 w-6" />, title: 'AI Readiness', desc: 'See where the industry stands on GenAI adoption—from exploration to mass production.' },
          ].map((card) => (
            <Link
              key={card.title}
              to={user ? '/survey' : '/'}
              className="rounded-2xl bg-white p-8 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all group"
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-secondary">
                {card.icon}
              </div>
              <h3 className="text-xl font-semibold text-gray-900 group-hover:text-primary transition-colors">{card.title}</h3>
              <p className="mt-2 text-gray-600">{card.desc}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-secondary opacity-0 group-hover:opacity-100 transition-opacity">
                {user ? 'Start Survey' : 'Sign in to participate'} <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Home;