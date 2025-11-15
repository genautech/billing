import React from 'react';

export const StatCard: React.FC<{ title: string; value: string; icon: React.ReactNode }> = ({ title, value, icon }) => (
    <div className="bg-gradient-to-br from-white to-gray-50 p-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 border border-gray-100 flex items-center space-x-3 group">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg p-2 shadow-sm group-hover:scale-110 transition-transform duration-300">
            {icon}
        </div>
        <div className="flex-1">
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">{title}</p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">{value}</p>
        </div>
    </div>
);
