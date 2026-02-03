import React, { useMemo, useEffect, useState } from 'react';
import type { CobrancaMensal, Cliente, DetalheEnvio, TabelaPrecoItem } from '../types';
import { 
    countShipmentsInMonth, 
    getDetalhesByCobrancaId, 
    getTabelaPrecos, 
    calculatePrecoVendaForDisplay, 
    isTemplateItem, 
    getLastInvoiceStorageQuantities,
    getCostCategoryGroup 
} from '../services/firestoreService';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    PieChart as RechartsPieChart,
    Pie,
    Cell,
    Treemap
} from 'recharts';

interface ClientDashboardProps {
    clientCobrancas: CobrancaMensal[];
    client: Cliente | undefined;
}

// Real Brazil SVG paths - accurate geographic shapes (viewBox 0 0 600 700)
const BRAZIL_STATES: Record<string, { path: string; center: { x: number; y: number }; name: string }> = {
    'AC': { 
        path: 'M42,248 L48,235 L62,228 L82,230 L95,242 L98,258 L92,272 L75,280 L55,278 L42,265 Z',
        center: { x: 70, y: 255 }, name: 'Acre' 
    },
    'AM': { 
        path: 'M62,120 L95,105 L140,100 L185,108 L220,125 L235,150 L230,185 L210,210 L170,225 L130,228 L100,235 L82,230 L62,228 L48,235 L42,248 L42,220 L50,180 L48,145 Z',
        center: { x: 140, y: 165 }, name: 'Amazonas' 
    },
    'RR': { 
        path: 'M120,42 L155,35 L185,48 L195,78 L185,108 L140,100 L120,75 L115,55 Z',
        center: { x: 155, y: 70 }, name: 'Roraima' 
    },
    'AP': { 
        path: 'M285,38 L318,35 L340,58 L338,95 L315,118 L285,110 L270,78 L275,52 Z',
        center: { x: 305, y: 75 }, name: 'Amapá' 
    },
    'PA': { 
        path: 'M185,108 L220,125 L260,115 L285,110 L315,118 L340,125 L365,155 L360,190 L340,210 L305,220 L270,225 L235,218 L210,210 L230,185 L235,150 Z',
        center: { x: 280, y: 165 }, name: 'Pará' 
    },
    'RO': { 
        path: 'M98,258 L130,228 L155,235 L162,265 L150,295 L118,302 L95,290 L92,272 Z',
        center: { x: 125, y: 268 }, name: 'Rondônia' 
    },
    'MT': { 
        path: 'M130,228 L170,225 L210,238 L235,258 L245,295 L235,340 L200,355 L160,348 L140,318 L118,302 L150,295 L162,265 L155,235 Z',
        center: { x: 185, y: 290 }, name: 'Mato Grosso' 
    },
    'MS': { 
        path: 'M160,348 L200,355 L218,390 L205,425 L170,440 L140,420 L135,380 L140,355 Z',
        center: { x: 175, y: 395 }, name: 'Mato Grosso do Sul' 
    },
    'GO': { 
        path: 'M235,340 L275,328 L310,342 L315,378 L295,405 L260,410 L235,395 L230,360 Z',
        center: { x: 272, y: 370 }, name: 'Goiás' 
    },
    'DF': { 
        path: 'M295,355 L310,352 L315,365 L305,372 L292,368 Z',
        center: { x: 303, y: 362 }, name: 'DF' 
    },
    'TO': { 
        path: 'M270,225 L305,220 L330,245 L335,290 L315,325 L275,328 L255,295 L258,255 Z',
        center: { x: 295, y: 275 }, name: 'Tocantins' 
    },
    'MA': { 
        path: 'M305,165 L340,158 L380,172 L395,205 L375,235 L340,240 L305,220 L310,190 Z',
        center: { x: 350, y: 200 }, name: 'Maranhão' 
    },
    'PI': { 
        path: 'M340,240 L375,235 L400,258 L405,295 L385,320 L350,318 L330,290 L330,260 Z',
        center: { x: 368, y: 280 }, name: 'Piauí' 
    },
    'CE': { 
        path: 'M395,195 L428,185 L455,202 L455,235 L435,255 L405,252 L395,225 Z',
        center: { x: 425, y: 220 }, name: 'Ceará' 
    },
    'RN': { 
        path: 'M455,195 L485,195 L492,218 L475,235 L455,235 L455,215 Z',
        center: { x: 472, y: 215 }, name: 'Rio Grande do Norte' 
    },
    'PB': { 
        path: 'M455,235 L475,235 L490,245 L488,262 L455,265 L445,250 Z',
        center: { x: 468, y: 250 }, name: 'Paraíba' 
    },
    'PE': { 
        path: 'M405,265 L455,265 L485,275 L480,295 L440,302 L405,295 Z',
        center: { x: 445, y: 282 }, name: 'Pernambuco' 
    },
    'AL': { 
        path: 'M455,302 L478,298 L485,318 L468,328 L450,322 Z',
        center: { x: 468, y: 312 }, name: 'Alagoas' 
    },
    'SE': { 
        path: 'M445,328 L468,325 L475,345 L455,352 L442,342 Z',
        center: { x: 458, y: 338 }, name: 'Sergipe' 
    },
    'BA': { 
        path: 'M350,318 L385,320 L420,330 L455,352 L465,395 L445,435 L395,455 L355,440 L335,400 L330,355 L340,332 Z',
        center: { x: 395, y: 385 }, name: 'Bahia' 
    },
    'MG': { 
        path: 'M295,405 L355,398 L395,415 L430,440 L435,485 L405,520 L355,528 L310,510 L285,470 L275,430 Z',
        center: { x: 355, y: 465 }, name: 'Minas Gerais' 
    },
    'ES': { 
        path: 'M435,455 L465,448 L475,485 L458,510 L435,505 L430,470 Z',
        center: { x: 452, y: 478 }, name: 'Espírito Santo' 
    },
    'RJ': { 
        path: 'M390,515 L430,502 L458,510 L455,535 L420,548 L390,540 Z',
        center: { x: 425, y: 525 }, name: 'Rio de Janeiro' 
    },
    'SP': { 
        path: 'M275,430 L310,445 L355,468 L390,490 L395,530 L350,558 L300,555 L260,530 L248,490 L255,455 Z',
        center: { x: 320, y: 500 }, name: 'São Paulo' 
    },
    'PR': { 
        path: 'M248,490 L300,505 L330,530 L325,568 L285,590 L245,580 L225,545 L228,510 Z',
        center: { x: 275, y: 545 }, name: 'Paraná' 
    },
    'SC': { 
        path: 'M260,585 L300,575 L325,595 L315,625 L275,638 L248,618 L250,595 Z',
        center: { x: 285, y: 608 }, name: 'Santa Catarina' 
    },
    'RS': { 
        path: 'M220,620 L275,630 L310,655 L295,698 L245,715 L200,695 L180,658 L195,628 Z',
        center: { x: 248, y: 668 }, name: 'Rio Grande do Sul' 
    }
};

// Compact stat card
const StatCard: React.FC<{ title: string; value: string; icon?: React.ReactNode; trend?: 'up' | 'down' | 'neutral' }> = ({ title, value, icon, trend }) => (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between">
            <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
                <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
            </div>
            {icon && <div className="text-gray-400">{icon}</div>}
        </div>
    </div>
);

// Brazil Map with colored states + bubbles
const BrazilMapChart: React.FC<{ 
    data: { label: string; value: number }[];
    formatValue: (v: number) => string;
    mesReferencia?: string;
    totalFatura?: number;
}> = ({ data, formatValue, mesReferencia, totalFatura }) => {
    const [hoveredState, setHoveredState] = useState<string | null>(null);
    
    const { maxValue, total, stateData } = useMemo(() => {
        const stateMap = new Map(data.map(d => [d.label, d.value]));
        const values = data.map(d => d.value);
        return {
            maxValue: values.length > 0 ? Math.max(...values) : 0,
            total: values.reduce((sum, v) => sum + v, 0),
            stateData: stateMap
        };
    }, [data]);

    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 bg-gradient-to-br from-slate-50 to-cyan-50 rounded-xl border border-slate-200">
                <div className="text-center">
                    <svg className="w-12 h-12 mx-auto mb-2 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    <p className="text-sm text-slate-500">Sem dados de envio</p>
                </div>
            </div>
        );
    }

    const getStateColor = (value: number) => {
        if (value === 0) return '#e2e8f0'; // slate-200
        const intensity = maxValue > 0 ? value / maxValue : 0;
        if (intensity > 0.7) return '#0891b2'; // cyan-600
        if (intensity > 0.4) return '#14b8a6'; // teal-500
        if (intensity > 0.15) return '#5eead4'; // teal-300
        return '#99f6e4'; // teal-200
    };

    const getBubbleSize = (value: number) => {
        if (maxValue === 0 || value === 0) return 0;
        const minSize = 8;
        const maxSize = 22;
        return minSize + (value / maxValue) * (maxSize - minSize);
    };

    // Verificar se total do mapa corresponde ao total da fatura
    const mapTotal = total;
    const expectedTotal = totalFatura || 0;
    const hasDiscrepancy = expectedTotal > 0 && Math.abs(mapTotal - expectedTotal) > 1;

    return (
        <div className="relative">
            {/* Header with total and month reference */}
            <div className="flex justify-between items-center mb-3 px-1">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></div>
                    <span className="text-xs font-medium text-slate-600">
                        Envios {mesReferencia ? `- ${mesReferencia}` : ''}
                    </span>
                </div>
                <div className="text-right">
                    <span className="text-lg font-bold text-slate-800">{total.toLocaleString('pt-BR')}</span>
                    {hasDiscrepancy && (
                        <span className="text-xs text-amber-600 block">
                            (Fatura: {expectedTotal.toLocaleString('pt-BR')})
                        </span>
                    )}
                </div>
            </div>
            
            {/* Map container */}
            <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-slate-100 via-cyan-50 to-teal-50 border border-slate-200" style={{ height: '320px' }}>
                <svg viewBox="30 25 480 710" className="w-full h-full" preserveAspectRatio="xMidYMid meet" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.05))' }}>
                    <defs>
                        <filter id="glow">
                            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                            <feMerge>
                                <feMergeNode in="coloredBlur"/>
                                <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                        </filter>
                        <linearGradient id="bubbleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#06b6d4" />
                            <stop offset="100%" stopColor="#0891b2" />
                        </linearGradient>
                    </defs>
                    
                    {/* Render all states */}
                    {Object.entries(BRAZIL_STATES).map(([code, state]) => {
                        const value = stateData.get(code) || 0;
                        const isHovered = hoveredState === code;
                        const hasData = value > 0;
                        
                        return (
                            <g key={code}>
                                {/* State shape */}
                                <path
                                    d={state.path}
                                    fill={getStateColor(value)}
                                    stroke={isHovered ? '#0891b2' : '#94a3b8'}
                                    strokeWidth={isHovered ? 2 : 0.5}
                                    className="cursor-pointer transition-all duration-200"
                                    onMouseEnter={() => setHoveredState(code)}
                                    onMouseLeave={() => setHoveredState(null)}
                                    style={{ 
                                        filter: isHovered ? 'brightness(1.1)' : 'none',
                                        transform: isHovered ? 'scale(1.02)' : 'scale(1)',
                                        transformOrigin: `${state.center.x}px ${state.center.y}px`
                                    }}
                                />
                                
                                {/* Bubble overlay for states with data */}
                                {hasData && (
                                    <circle
                                        cx={state.center.x}
                                        cy={state.center.y}
                                        r={getBubbleSize(value)}
                                        fill="url(#bubbleGradient)"
                                        stroke="white"
                                        strokeWidth="2"
                                        className="pointer-events-none"
                                        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }}
                                    />
                                )}
                                
                                {/* State code label */}
                                {(hasData && getBubbleSize(value) > 10) && (
                                    <text
                                        x={state.center.x}
                                        y={state.center.y + 1}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fill="white"
                                        fontSize="9"
                                        fontWeight="bold"
                                        className="pointer-events-none"
                                        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}
                                    >
                                        {code}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </svg>
                
                {/* Floating tooltip */}
                {hoveredState && (
                    <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-sm rounded-lg shadow-xl px-3 py-2 border border-slate-200 z-10">
                        <p className="text-xs font-semibold text-slate-800">{BRAZIL_STATES[hoveredState]?.name}</p>
                        <p className="text-base font-bold text-cyan-600">
                            {stateData.get(hoveredState) ? formatValue(stateData.get(hoveredState)!) : '0 envios'}
                        </p>
                    </div>
                )}
            </div>
            
            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mt-3 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-teal-200 border border-slate-300"></div>
                    <span>Baixo</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-teal-400 border border-slate-300"></div>
                    <span>Médio</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-cyan-600 border border-slate-300"></div>
                    <span>Alto</span>
                </div>
            </div>
        </div>
    );
};

// Custom Treemap with improved visuals
const CostsTreemap: React.FC<{ 
    data: { label: string; value: number }[];
    formatCurrency: (v: number) => string;
}> = ({ data, formatCurrency }) => {
    const [hoveredItem, setHoveredItem] = useState<string | null>(null);
    const total = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);

    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 bg-gradient-to-br from-slate-50 to-indigo-50 rounded-xl border border-slate-200">
                <div className="text-center">
                    <svg className="w-12 h-12 mx-auto mb-2 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-slate-500">Sem dados de custos</p>
                </div>
            </div>
        );
    }

    const treemapData = data.slice(0, 12).map((d) => ({
        name: d.label,
        value: d.value
    }));

    // Gradient colors from deep indigo to violet to purple
    const GRADIENT_COLORS = [
        { bg: '#4f46e5', light: '#818cf8' }, // indigo
        { bg: '#7c3aed', light: '#a78bfa' }, // violet
        { bg: '#9333ea', light: '#c084fc' }, // purple
        { bg: '#6366f1', light: '#a5b4fc' }, // indigo-lighter
        { bg: '#8b5cf6', light: '#c4b5fd' }, // violet-lighter
        { bg: '#a855f7', light: '#d8b4fe' }, // purple-lighter
        { bg: '#5b21b6', light: '#8b5cf6' }, // violet-dark
        { bg: '#4c1d95', light: '#7c3aed' }, // violet-darker
        { bg: '#6d28d9', light: '#a78bfa' }, // violet-mid
        { bg: '#7e22ce', light: '#c084fc' }, // purple-dark
        { bg: '#581c87', light: '#9333ea' }, // purple-darker
        { bg: '#4338ca', light: '#6366f1' }, // indigo-dark
    ];

    return (
        <div className="relative">
            {/* Header */}
            <div className="flex justify-between items-center mb-3 px-1">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
                    <span className="text-xs font-medium text-slate-600">Custo Total</span>
                </div>
                <span className="text-lg font-bold text-slate-800">{formatCurrency(total)}</span>
            </div>
            
            {/* Treemap container */}
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-gradient-to-br from-slate-100 to-indigo-50" style={{ height: '280px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <Treemap
                        data={treemapData}
                        dataKey="value"
                        aspectRatio={4/3}
                        stroke="transparent"
                        content={({ x, y, width, height, name, value }) => {
                            if (width < 30 || height < 25) return null;
                            const rawIndex = treemapData.findIndex(d => d.name === name);
                            // Ensure index is always valid (findIndex can return -1)
                            const index = rawIndex >= 0 ? rawIndex : 0;
                            const colors = GRADIENT_COLORS[index % GRADIENT_COLORS.length] || GRADIENT_COLORS[0];
                            const isHovered = hoveredItem === name;
                            const percentage = total > 0 ? ((value as number) / total * 100).toFixed(1) : 0;
                            
                return (
                                <g
                                    onMouseEnter={() => setHoveredItem(name as string)}
                                    onMouseLeave={() => setHoveredItem(null)}
                                >
                                    <defs>
                                        <linearGradient id={`grad-${index}`} x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" stopColor={colors.light} stopOpacity="1" />
                                            <stop offset="100%" stopColor={colors.bg} stopOpacity="1" />
                                        </linearGradient>
                                    </defs>
                                    <rect
                                        x={x + 2}
                                        y={y + 2}
                                        width={width - 4}
                                        height={height - 4}
                                        rx={8}
                                        fill={`url(#grad-${index})`}
                                        className="cursor-pointer transition-all duration-200"
                                        style={{ 
                                            filter: isHovered ? 'brightness(1.15) drop-shadow(0 4px 8px rgba(0,0,0,0.2))' : 'drop-shadow(0 1px 3px rgba(0,0,0,0.1))',
                                            transform: isHovered ? 'scale(1.02)' : 'scale(1)',
                                            transformOrigin: `${x + width/2}px ${y + height/2}px`
                                        }}
                                    />
                                    {/* State code - always show if fits */}
                                    <text
                                        x={x + width / 2}
                                        y={y + height / 2 - (width > 60 && height > 50 ? 8 : 0)}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fill="white"
                                        fontSize={width > 80 ? 14 : width > 50 ? 12 : 10}
                                        fontWeight="bold"
                                        className="pointer-events-none"
                                        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
                                    >
                                        {name}
                                    </text>
                                    {/* Value - show on larger boxes */}
                                    {width > 60 && height > 50 && (
                                        <text
                                            x={x + width / 2}
                                            y={y + height / 2 + 10}
                                            textAnchor="middle"
                                            fill="rgba(255,255,255,0.9)"
                                            fontSize={10}
                                            className="pointer-events-none"
                                            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}
                                        >
                                            {formatCurrency(value as number)}
                                        </text>
                                    )}
                                    {/* Percentage badge on larger boxes */}
                                    {width > 80 && height > 60 && (
                                        <text
                                            x={x + width / 2}
                                            y={y + height / 2 + 24}
                                            textAnchor="middle"
                                            fill="rgba(255,255,255,0.7)"
                                            fontSize={9}
                                            className="pointer-events-none"
                                        >
                                            {percentage}%
                                        </text>
                                    )}
                                </g>
                            );
                        }}
                    />
                </ResponsiveContainer>
            </div>
            
            {/* Floating info for hovered item */}
            {hoveredItem && (
                <div className="absolute top-12 right-2 bg-white/95 backdrop-blur-sm rounded-lg shadow-xl px-3 py-2 border border-slate-200 z-10">
                    <p className="text-xs font-semibold text-slate-800">{BRAZIL_STATES[hoveredItem]?.name || hoveredItem}</p>
                    <p className="text-base font-bold text-indigo-600">
                        {formatCurrency(treemapData.find(d => d.name === hoveredItem)?.value || 0)}
                    </p>
                </div>
            )}
            
            {/* Stats row */}
            <div className="flex items-center justify-between mt-3 px-1 text-xs text-slate-500">
                <span>{treemapData.length} estados</span>
                <span>Média: {formatCurrency(treemapData.length > 0 ? total / treemapData.length : 0)}</span>
                    </div>
        </div>
    );
};

// Donut chart with center value
const DonutChart: React.FC<{ 
    data: { label: string; value: number; color: string }[];
    formatCurrency: (v: number) => string;
}> = ({ data, formatCurrency }) => {
    const total = useMemo(() => data.reduce((sum, item) => sum + item.value, 0), [data]);
    
    if (total === 0) {
        return (
            <div className="flex items-center justify-center h-48 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg">
                <p className="text-sm text-gray-500">Sem dados para este período</p>
            </div>
        );
    }

    const chartData = data.map(d => ({ name: d.label, value: d.value, color: d.color }));
    
    return (
        <div className="flex items-center gap-4">
            <div className="relative" style={{ width: '140px', height: '140px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                        <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={65}
                            paddingAngle={2}
                            dataKey="value"
                        >
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip 
                            formatter={(value: number) => formatCurrency(value)}
                            contentStyle={{ 
                                borderRadius: '8px', 
                                border: 'none', 
                                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' 
                            }}
                        />
                    </RechartsPieChart>
                </ResponsiveContainer>
                {/* Center total */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                        <p className="text-xs text-gray-500">Total</p>
                        <p className="text-sm font-bold text-gray-800">{formatCurrency(total)}</p>
                    </div>
                </div>
            </div>
            {/* Compact legend */}
            <div className="flex-1 space-y-1">
                {data.map(item => (
                    <div key={item.label} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                            <span className="text-gray-600 truncate max-w-[100px]">{item.label}</span>
                        </div>
                        <span className="font-medium text-gray-800">{((item.value / total) * 100).toFixed(0)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// Area chart for billing history
const BillingAreaChart: React.FC<{ 
    data: { label: string; value: number }[];
    formatCurrency: (v: number) => string;
}> = ({ data, formatCurrency }) => {
    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center h-32 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg">
                <p className="text-sm text-gray-500">Sem histórico</p>
            </div>
        );
    }

    const chartData = data.map(d => ({ name: d.label, value: d.value }));
    const total = data.reduce((sum, d) => sum + d.value, 0);
    const avg = data.length > 0 ? total / data.length : 0;

    return (
        <div>
            <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-medium text-gray-500">Média mensal</span>
                <span className="text-sm font-bold text-gray-800">{formatCurrency(avg)}</span>
            </div>
            <div style={{ height: '120px' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <XAxis 
                            dataKey="name" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 10, fill: '#6b7280' }}
                        />
                        <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 9, fill: '#9ca3af' }}
                            tickFormatter={(v) => `${(v/1000).toFixed(0)}k`}
                        />
                        <Tooltip 
                            formatter={(value: number) => [formatCurrency(value), 'Valor']}
                            contentStyle={{ 
                                borderRadius: '8px', 
                                border: 'none', 
                                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                fontSize: '12px'
                            }}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="value" 
                            stroke="#3b82f6" 
                            strokeWidth={2}
                            fill="url(#areaGradient)"
                            dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }}
                            activeDot={{ r: 5, fill: '#2563eb', strokeWidth: 0 }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

const ClientDashboard: React.FC<ClientDashboardProps> = ({ clientCobrancas, client }) => {
    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
    const [selectedInvoiceDetalhes, setSelectedInvoiceDetalhes] = useState<DetalheEnvio[]>([]);
    const [tabelaPrecos, setTabelaPrecos] = useState<TabelaPrecoItem[]>([]);
    const [previewData, setPreviewData] = useState<{
        armazenagemEstimada: number;
        palletsEstimados: number;
        binsEstimados: number;
        isLoading: boolean;
    }>({
        armazenagemEstimada: 0,
        palletsEstimados: 0,
        binsEstimados: 0,
        isLoading: true
    });

    // Set default selected invoice
    useEffect(() => {
        if (clientCobrancas.length > 0 && !selectedInvoiceId) {
            setSelectedInvoiceId(clientCobrancas[0].id);
        }
    }, [clientCobrancas, selectedInvoiceId]);

    const selectedInvoice = useMemo(() => 
        clientCobrancas.find(c => c.id === selectedInvoiceId) || clientCobrancas[0],
        [clientCobrancas, selectedInvoiceId]
    );

    // Fetch selected invoice details and price table
    useEffect(() => {
        const fetchData = async () => {
            try {
                if (!selectedInvoice) return;
                
                const [precosData, detalhes] = await Promise.all([
                    getTabelaPrecos(client?.id),
                    getDetalhesByCobrancaId(selectedInvoice.id)
                ]);
                setTabelaPrecos(precosData);
                setSelectedInvoiceDetalhes(detalhes);
                
                console.log('📊 Dashboard - Selected Invoice Details:', {
                    mesReferencia: selectedInvoice.mesReferencia,
                    quantidadeEnvios: selectedInvoice.quantidadeEnvios,
                    detalhesCarregados: detalhes.length,
                    detalhesComEstado: detalhes.filter(d => d.estado).length
                });
            } catch (error) {
                console.error('Error fetching dashboard data:', error);
            }
        };
        if (selectedInvoice) {
            fetchData();
        }
    }, [selectedInvoice, client?.id]);

    // Calculate preview for next invoice
    useEffect(() => {
        const calculatePreview = async () => {
            if (!client?.id || clientCobrancas.length === 0) {
                setPreviewData({ armazenagemEstimada: 0, palletsEstimados: 0, binsEstimados: 0, isLoading: false });
                return;
            }

            setPreviewData(prev => ({ ...prev, isLoading: true }));

            try {
                const lastStorage = await getLastInvoiceStorageQuantities(client.id);
                const precos = await getTabelaPrecos(client.id);
                
                const precoPallet = precos.find(p => 
                    getCostCategoryGroup(p.categoria) === 'armazenagem' && 
                    (p.descricao.toLowerCase().includes('pallet') || p.metrica.toLowerCase().includes('pallet'))
                )?.precoVenda || 0;

                const precoBin = precos.find(p => 
                    getCostCategoryGroup(p.categoria) === 'armazenagem' && 
                    (p.descricao.toLowerCase().includes('bin') || p.metrica.toLowerCase().includes('bin'))
                )?.precoVenda || 0;

                let palletsEstimados = lastStorage.pallets || 0;
                let binsEstimados = lastStorage.bins || 0;
                const armazenagemEstimada = (palletsEstimados * precoPallet) + (binsEstimados * precoBin);

                setPreviewData({ armazenagemEstimada, palletsEstimados, binsEstimados, isLoading: false });
            } catch (error) {
                console.error('Error calculating preview:', error);
                setPreviewData({ armazenagemEstimada: 0, palletsEstimados: 0, binsEstimados: 0, isLoading: false });
            }
        };

        calculatePreview();
    }, [client?.id, client?.unidadesEmEstoque, clientCobrancas]);

    const latestInvoice = clientCobrancas[0];

    const monthlyChartData = useMemo(() => {
        return clientCobrancas
            .slice(0, 6)
            .reverse()
            .map(c => ({
                label: c.mesReferencia.split('/')[0].substring(0, 3),
                value: c.valorTotal
            }));
    }, [clientCobrancas]);

    const breakdownChartData = useMemo(() => {
        if (!selectedInvoice) return [];
        const data = [];
        if (selectedInvoice.totalEnvio > 0) {
            data.push({ label: 'Envio', value: selectedInvoice.totalEnvio, color: '#3b82f6' });
        }
        if (selectedInvoice.totalCustosLogisticos > 0) {
            data.push({ label: 'Logísticos', value: selectedInvoice.totalCustosLogisticos, color: '#8b5cf6' });
        }
        if (selectedInvoice.totalArmazenagem > 0) {
            data.push({ label: 'Armazenagem', value: selectedInvoice.totalArmazenagem, color: '#a855f7' });
        }
        if (selectedInvoice.totalCustosExtras && selectedInvoice.totalCustosExtras > 0) {
            data.push({ label: 'Extras', value: selectedInvoice.totalCustosExtras, color: '#f97316' });
        }
        if (selectedInvoice.totalCustosAdicionais && selectedInvoice.totalCustosAdicionais > 0) {
            data.push({ label: 'Adicionais', value: selectedInvoice.totalCustosAdicionais, color: '#f59e0b' });
        }
        return data;
    }, [selectedInvoice]);
    
    // Use selected invoice details for state charts (to match invoice totals)
    const shipmentsByRegionData = useMemo(() => {
        const regionCounts: Record<string, number> = {};
        let totalEnvios = 0;

        selectedInvoiceDetalhes.forEach(detalhe => {
            if (!detalhe.tabelaPrecoItemId) return;
            
            const itemPreco = tabelaPrecos.find(c => c.id === detalhe.tabelaPrecoItemId);
            if (!itemPreco) return;

            const isShippingItem = itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos';
            if (!isShippingItem) return;

            totalEnvios += detalhe.quantidade;
            
            // Get estado - use 'N/I' (Não Informado) if missing
            let estado = (detalhe.estado || 'N/I').toUpperCase().trim();
            if (estado && estado !== 'N/I') {
            const estadoMatch = estado.match(/\b([A-Z]{2})\b/);
            if (estadoMatch) {
                estado = estadoMatch[1];
            } else if (estado.length > 2) {
                estado = estado.substring(0, 2);
                }
            }

            regionCounts[estado] = (regionCounts[estado] || 0) + detalhe.quantidade;
        });

        console.log('📊 Shipments by Region (Selected Invoice):', {
            totalEnvios,
            quantidadeFatura: selectedInvoice?.quantidadeEnvios,
            estados: Object.keys(regionCounts),
            regionCounts
        });

        if (Object.keys(regionCounts).length === 0) return [];
        
        return Object.entries(regionCounts)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);

    }, [selectedInvoiceDetalhes, tabelaPrecos, selectedInvoice]);

    // Use selected invoice details for cost chart
    const shippingCostsByStateData = useMemo(() => {
        const stateCosts: Record<string, number> = {};

        selectedInvoiceDetalhes.forEach(detalhe => {
            if (!detalhe.tabelaPrecoItemId) return;
            
            const itemPreco = tabelaPrecos.find(c => c.id === detalhe.tabelaPrecoItemId);
            if (!itemPreco) return;

            const isShippingItem = itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos';
            if (!isShippingItem) return;

            const isTemplate = isTemplateItem(itemPreco);
            let subtotal = isTemplate ? detalhe.quantidade : calculatePrecoVendaForDisplay(itemPreco) * detalhe.quantidade;

            // Get estado - use 'N/I' (Não Informado) if missing
            let estado = (detalhe.estado || 'N/I').toUpperCase().trim();
            if (estado && estado !== 'N/I') {
            const estadoMatch = estado.match(/\b([A-Z]{2})\b/);
            if (estadoMatch) {
                estado = estadoMatch[1];
            } else if (estado.length > 2) {
                estado = estado.substring(0, 2);
                }
            }

            stateCosts[estado] = (stateCosts[estado] || 0) + subtotal;
        });

        if (Object.keys(stateCosts).length === 0) return [];
        
        return Object.entries(stateCosts)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);

    }, [selectedInvoiceDetalhes, tabelaPrecos]);

    const { averageOperationalCost, averageTotalValuePerShipment } = useMemo(() => {
        let totalShipmentCount = 0;
        let totalOperationalCost = 0;
        let totalBilledValue = 0;

        clientCobrancas.forEach(cobranca => {
            if (cobranca.relatorioRastreioCSV) {
                const shipmentCountInInvoice = countShipmentsInMonth(cobranca.relatorioRastreioCSV, cobranca.mesReferencia);
                
                if(shipmentCountInInvoice > 0) {
                    totalShipmentCount += shipmentCountInInvoice;
                    totalOperationalCost += (cobranca.totalEnvio || 0) + (cobranca.totalCustosLogisticos || 0);
                    totalBilledValue += cobranca.valorTotal;
                }
            }
        });

        const averageOpCost = totalShipmentCount > 0 ? formatCurrency(totalOperationalCost / totalShipmentCount) : 'N/A';
        const averageTotalVal = totalShipmentCount > 0 ? formatCurrency(totalBilledValue / totalShipmentCount) : 'N/A';

        return { averageOperationalCost: averageOpCost, averageTotalValuePerShipment: averageTotalVal };
    }, [clientCobrancas]);


    return (
        <div className="space-y-4 animate-fade-in">
            {/* Stats Row - Compact */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard title="Última Fatura" value={latestInvoice ? formatCurrency(latestInvoice.valorTotal) : 'N/A'} />
                <StatCard title="Média/Envio" value={averageTotalValuePerShipment} />
                <StatCard title="Custo Op. Médio" value={averageOperationalCost} />
                <StatCard title="Em Estoque" value={client?.unidadesEmEstoque?.toLocaleString('pt-BR') || '0'} />
            </div>

            {/* Preview Card - Collapsible style */}
            {previewData.armazenagemEstimada > 0 && (
                <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl p-4 text-white shadow-lg">
                    <div className="flex items-center justify-between">
                                <div>
                            <p className="text-xs font-medium text-blue-100 uppercase tracking-wide">Prévia Próxima Fatura</p>
                            <p className="text-2xl font-bold mt-1">{formatCurrency(previewData.armazenagemEstimada)}</p>
                            <p className="text-xs text-blue-200 mt-1">
                                {previewData.palletsEstimados > 0 && `${previewData.palletsEstimados} pallets`}
                                {previewData.palletsEstimados > 0 && previewData.binsEstimados > 0 && ' + '}
                                {previewData.binsEstimados > 0 && `${previewData.binsEstimados} bins`}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-blue-200">Apenas armazenagem</p>
                            <p className="text-xs text-blue-200">Envios serão adicionados</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Month Selector for Charts */}
            {clientCobrancas.length > 1 && (
                <div className="flex items-center justify-between bg-white rounded-xl p-3 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-sm font-medium text-gray-700">Período dos Gráficos:</span>
                    </div>
                    <select
                        value={selectedInvoiceId || ''}
                        onChange={(e) => setSelectedInvoiceId(e.target.value)}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 cursor-pointer hover:bg-gray-100 transition-colors"
                    >
                        {clientCobrancas.map(c => (
                            <option key={c.id} value={c.id}>{c.mesReferencia}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Charts Grid - Compact 2x2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Billing History - Area Chart */}
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Histórico de Faturamento</h3>
                    <BillingAreaChart data={monthlyChartData} formatCurrency={formatCurrency} />
            </div>
            
                {/* Cost Breakdown - Donut */}
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">
                        Detalhamento {selectedInvoice?.mesReferencia ? `(${selectedInvoice.mesReferencia})` : ''}
                    </h3>
                    <DonutChart data={breakdownChartData} formatCurrency={formatCurrency} />
                </div>

                {/* Brazil Map - Shipments */}
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <h3 className="text-sm font-semibold text-gray-800 mb-1 flex items-center gap-2">
                        <svg className="w-4 h-4 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Envios por Estado
                    </h3>
                    <BrazilMapChart 
                        data={shipmentsByRegionData} 
                        formatValue={(v) => `${v.toLocaleString('pt-BR')} envios`}
                        mesReferencia={selectedInvoice?.mesReferencia}
                        totalFatura={selectedInvoice?.quantidadeEnvios}
                    />
                </div>

                {/* Treemap - Shipping Costs */}
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <h3 className="text-sm font-semibold text-gray-800 mb-1 flex items-center gap-2">
                        <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Custos por Estado
                    </h3>
                    <CostsTreemap data={shippingCostsByStateData} formatCurrency={formatCurrency} />
                </div>
            </div>
            
            {/* Help Section - Collapsed by default */}
            <details className="bg-white rounded-xl shadow-sm border border-gray-100">
                <summary className="p-4 cursor-pointer hover:bg-gray-50 rounded-xl transition-colors">
                    <span className="text-sm font-semibold text-gray-800">Entendendo sua Fatura</span>
                </summary>
                <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-600">
                    <div>
                        <h4 className="font-semibold text-gray-800 mb-1">Pick & Pack</h4>
                        <p>Processo de preparação: coleta, embalagem e proteção dos produtos.</p>
                    </div>
                    <div>
                        <h4 className="font-semibold text-gray-800 mb-1">Envios</h4>
                        <p>Custo do frete baseado em peso, dimensões e localidade.</p>
                    </div>
                     <div>
                        <h4 className="font-semibold text-gray-800 mb-1">Armazenamento</h4>
                        <p>Custo de manter produtos em estoque (por posição ou unidade).</p>
                    </div>
                     <div>
                        <h4 className="font-semibold text-gray-800 mb-1">Outros Custos</h4>
                        <p>Impostos (Difal), seguro, manuseio especial e devoluções.</p>
                    </div>
                </div>
            </details>
        </div>
    );
};

export default ClientDashboard;
