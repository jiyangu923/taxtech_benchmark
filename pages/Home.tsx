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
          {/* Card 1 */}
          <div className="rounded-2xl bg-white p-8 shadow-lg">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-secondary">
              <TrendingUp className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900">Automation Metrics</h3>
            <p className="mt-2 text-gray-600">
              Benchmark your tax calculation, payment, and compliance automation rates against the market.
            </p>
          </div>

          {/* Card 2 */}
          <div className="rounded-2xl bg-white p-8 shadow-lg">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-secondary">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900">Team Structure</h3>
            <p className="mt-2 text-gray-600">
              Understand how peer organizations structure their tax technology vs. tax business teams.
            </p>
          </div>

          {/* Card 3 */}
          <div className="rounded-2xl bg-white p-8 shadow-lg">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-secondary">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900">AI Readiness</h3>
            <p className="mt-2 text-gray-600">
              See where the industry stands on GenAI adoption—from exploration to mass production.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;