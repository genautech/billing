import React, { useMemo } from 'react';
import type { CobrancaMensal, Cliente } from '../../../types';
import { StatCard } from '../../ui/StatCard';

const BarChart: React.FC<{ data: { label: string; value: number }[]; valueFormatter: (value: number) => string; }> = ({ data, valueFormatter }) => {
    const maxValue = useMemo(() => Math.max(...data.map(d => d.value), 0), [data]);
    if (data.length === 0) return <div className="text-center text-gray-500 p-4 h-64 flex items-center justify-center">Dados insuficientes para o gráfico.</div>;

    return (
        <div className="flex justify-around items-end h-64 bg-gray-50 p-4 rounded-lg">
            {data.map(({ label, value }) => (
                <div key={label} className="flex flex-col items-center w-full text-center" style={{ maxWidth: '80px' }}>
                    <div
                        className="w-4/5 bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-md hover:from-blue-700 hover:to-blue-500 transition-all shadow-md"
                        style={{ height: `${maxValue > 0 ? (value / maxValue) * 100 : 0}%` }}
                        title={`${label}: ${valueFormatter(value)}`}
                    />
                    <span className="text-xs text-gray-600 mt-2 font-medium">{label}</span>
                    <span className="text-xs text-gray-500 mt-1">{valueFormatter(value)}</span>
                </div>
            ))}
        </div>
    );
};

interface DashboardViewProps {
    cobrancas: CobrancaMensal[];
    clientes: Cliente[];
}

const MonthlyProfitReport: React.FC<{ cobrancas: CobrancaMensal[], clientes: Cliente[] }> = ({ cobrancas, clientes }) => {
    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    const reportData = useMemo(() => {
        if (cobrancas.length === 0) return null;

        const latestMonth = cobrancas.sort((a, b) => new Date(b.dataVencimento).getTime() - new Date(a.dataVencimento).getTime())[0].mesReferencia;
        
        const monthCobrancas = cobrancas.filter(c => c.mesReferencia === latestMonth);

        const clientData = new Map<string, { faturado: number, custo: number }>();

        monthCobrancas.forEach(c => {
            const data = clientData.get(c.clienteId) || { faturado: 0, custo: 0 };
            data.faturado += c.valorTotal;
            data.custo += c.custoTotal;
            clientData.set(c.clienteId, data);
        });

        const report = Array.from(clientData.entries()).map(([clienteId, data]) => {
            const cliente = clientes.find(c => c.id === clienteId);
            const lucro = data.faturado - data.custo;
            const margem = data.faturado > 0 ? (lucro / data.faturado) * 100 : 0;
            return {
                clienteNome: cliente?.nome || 'Desconhecido',
                ...data,
                lucro,
                margem
            };
        }).sort((a,b) => b.faturado - a.faturado);

        return {
            month: latestMonth,
            report
        };

    }, [cobrancas, clientes]);
    
    if (!reportData) {
        return <div className="text-center text-gray-500 p-4">Não há dados de faturamento para exibir o relatório.</div>;
    }

    return (
        <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">Relatório de Lucratividade - {reportData.month}</h3>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Faturado</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Custo Total</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Lucro</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Margem</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {reportData.report.map(row => (
                             <tr key={row.clienteNome}>
                                <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.clienteNome}</td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700 text-right">{formatCurrency(row.faturado)}</td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{formatCurrency(row.custo)}</td>
                                <td className={`px-4 py-4 whitespace-nowrap text-sm font-semibold text-right ${row.lucro >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(row.lucro)}</td>
                                <td className={`px-4 py-4 whitespace-nowrap text-sm font-semibold text-right ${row.margem >= 0 ? 'text-green-600' : 'text-red-600'}`}>{row.margem.toFixed(2)}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


const DashboardView: React.FC<DashboardViewProps> = ({ cobrancas, clientes }) => {
    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    
    const stats = useMemo(() => {
        const totalFaturado = cobrancas.reduce((sum, c) => sum + c.valorTotal, 0);
        const totalCusto = cobrancas.reduce((sum, c) => sum + c.custoTotal, 0);
        const lucroTotal = totalFaturado - totalCusto;
        const margemTotal = totalFaturado > 0 ? (lucroTotal / totalFaturado) * 100 : 0;
        const aReceber = cobrancas.filter(c => c.status === 'Pendente' || c.status === 'Vencido').reduce((sum, c) => sum + c.valorTotal, 0);
        const faturasAbertas = cobrancas.filter(c => c.status !== 'Paga').length;
        return { totalFaturado, aReceber, faturasAbertas, totalFaturas: cobrancas.length, lucroTotal, margemTotal, totalCusto };
    }, [cobrancas]);

    // Monthly performance data
    const monthlyPerformanceData = useMemo(() => {
        const monthlyData: Record<string, { faturado: number; custo: number; lucro: number }> = {};
        
        cobrancas.forEach(c => {
            const month = c.mesReferencia;
            if (!monthlyData[month]) {
                monthlyData[month] = { faturado: 0, custo: 0, lucro: 0 };
            }
            monthlyData[month].faturado += c.valorTotal;
            monthlyData[month].custo += c.custoTotal;
            monthlyData[month].lucro += (c.valorTotal - c.custoTotal);
        });

        return Object.entries(monthlyData)
            .sort(([a], [b]) => {
                // Sort by month/year
                const [monthA, yearA] = a.split('/');
                const [monthB, yearB] = b.split('/');
                const dateA = new Date(parseInt(yearA), parseInt(monthA) - 1);
                const dateB = new Date(parseInt(yearB), parseInt(monthB) - 1);
                return dateB.getTime() - dateA.getTime();
            })
            .slice(0, 6)
            .reverse()
            .map(([month, data]) => ({
                label: month.split('/')[0].substring(0, 3),
                faturado: data.faturado,
                lucro: data.lucro
            }));
    }, [cobrancas]);

    // Profit trend data
    const profitTrendData = useMemo(() => {
        return monthlyPerformanceData.map(d => ({
            label: d.label,
            value: d.lucro
        }));
    }, [monthlyPerformanceData]);

    // Revenue trend data
    const revenueTrendData = useMemo(() => {
        return monthlyPerformanceData.map(d => ({
            label: d.label,
            value: d.faturado
        }));
    }, [monthlyPerformanceData]);

    const profitValue = `${formatCurrency(stats.lucroTotal)} (${stats.margemTotal.toFixed(2)}%)`;

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Dashboard de Performance</h2>
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <StatCard title="Total Faturado" value={formatCurrency(stats.totalFaturado)} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 6V5m0 14v-1m-7-7h-1m14 0h-1m-7-7a9 9 0 110 18 9 9 0 010-18z" /></svg>} />
                <StatCard title="Lucro / Margem Total" value={profitValue} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>} />
                <StatCard title="A Receber" value={formatCurrency(stats.aReceber)} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>} />
                <StatCard title="Faturas em Aberto" value={String(stats.faturasAbertas)} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>} />
                <StatCard title="Total de Faturas" value={String(stats.totalFaturas)} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>} />
            </div>
            
            {/* Performance Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Tendência de Faturamento (Últimos 6 meses)</h3>
                    <BarChart data={revenueTrendData} valueFormatter={formatCurrency} />
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Tendência de Lucro (Últimos 6 meses)</h3>
                    <BarChart data={profitTrendData} valueFormatter={formatCurrency} />
                </div>
            </div>
            
            <MonthlyProfitReport cobrancas={cobrancas} clientes={clientes} />
        </div>
    );
};

export default DashboardView;