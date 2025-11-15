import React from 'react';

export const StatCard: React.FC<{ title: string; value: string; icon: React.ReactNode }> = ({ title, value, icon }) => (
    <div className="bg-gradient-to-br from-white to-gray-50 p-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-100 flex items-center space-x-4 group">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-4 shadow-md group-hover:scale-110 transition-transform duration-300">
            {icon}
        </div>
        <div className="flex-1">
            <p className="text-sm font-medium text-gray-600 uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
    </div>
);
