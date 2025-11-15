import React, { useState, useMemo } from 'react';

interface MonthPickerProps {
    selectedMonth: string;
    onSelectMonth: (month: string) => void;
}

const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export const MonthPicker: React.FC<MonthPickerProps> = ({ selectedMonth, onSelectMonth }) => {
    const [selectedYearStr, selectedMonthName] = useMemo(() => {
        const parts = selectedMonth.split('/');
        return [parts[1], parts[0]];
    }, [selectedMonth]);

    const [displayYear, setDisplayYear] = useState<number>(parseInt(selectedYearStr) || 2025);

    const handleSelectMonth = (monthIndex: number) => {
        onSelectMonth(`${monthNames[monthIndex]}/${displayYear}`);
    };

    return (
        <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-gray-300 rounded-lg shadow-xl p-4 z-20 animate-fade-in">
            <div className="flex justify-between items-center mb-4">
                <button
                    type="button"
                    onClick={() => setDisplayYear(displayYear - 1)}
                    disabled={displayYear <= 2025}
                    className="p-1 rounded-full hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Previous year"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                </button>
                <span className="font-semibold text-gray-800">{displayYear}</span>
                <button
                    type="button"
                    onClick={() => setDisplayYear(displayYear + 1)}
                    className="p-1 rounded-full hover:bg-gray-100"
                    aria-label="Next year"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
                {monthNames.map((month, index) => {
                    const isSelected = displayYear === parseInt(selectedYearStr) && month === selectedMonthName;
                    
                    return (
                        <button
                            key={month}
                            type="button"
                            onClick={() => handleSelectMonth(index)}
                            className={`p-2 rounded-md text-center text-sm transition-colors ${
                                isSelected 
                                    ? 'bg-blue-600 text-white hover:bg-blue-700 font-semibold' 
                                    : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            {month.substring(0, 3)}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
