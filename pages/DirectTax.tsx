import React from 'react';
import { Hammer } from 'lucide-react';

const DirectTax: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] bg-gray-50 px-4">
      <div className="bg-white p-12 rounded-2xl shadow-xl text-center max-w-2xl w-full border border-gray-100">
        <div className="inline-flex items-center justify-center h-24 w-24 rounded-full bg-indigo-50 mb-8 animate-pulse">
          <Hammer className="h-12 w-12 text-secondary" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Direct Tax Benchmark</h1>
        <div className="h-1 w-20 bg-secondary mx-auto mb-6 rounded-full"></div>
        <p className="text-xl text-gray-600 mb-8 leading-relaxed">
          We are actively building the benchmark survey and analytics for <span className="font-semibold text-gray-800">Direct Tax</span> (Corporate Income Tax, Transfer Pricing, and Provision).
        </p>
        <div className="bg-indigo-50 rounded-lg p-6 mb-8">
            <h3 className="font-semibold text-indigo-900 mb-2">Coming Soon</h3>
            <p className="text-indigo-700 text-sm">
                Expected launch: Q3 2026. 
            </p>
        </div>
        <button className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary hover:bg-indigo-900 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
          Notify Me When Ready
        </button>
      </div>
    </div>
  );
};

export default DirectTax;