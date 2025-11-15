import React from 'react';

const formElementClasses = "mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition text-gray-900 disabled:bg-gray-50 disabled:cursor-not-allowed";

export const FormInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input {...props} className={`${formElementClasses} ${props.className || ''}`} />
);

export const FormSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
    <select {...props} className={`${formElementClasses} ${props.className || ''}`} />
);
