import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
    getDetalhesByCobrancaId,
    getCustosAdicionaisByCobrancaId,
    generateInvoiceAnalysis,
    deleteCobranca,
    salvarCobrancaEditada,
    updateCobrancaStatus,
    getPrecoUnitarioDetalheFatura,
    getQuantidadeUsoFatura,
    recalculateCobrancaTotalsFromDetalhes,
    getShareableUrl,
    uploadFileToStorage,
    updateCobrancaWithNotaFiscal,
    deleteFileFromStorage,
    getCostCategoryGroup,
    getCostCategoryGroupForItem,
    getDisplayDescriptionForPriceItem,
    getTabelaPrecos,
    parseNFeXmlForDifal,
    parseMultipleNFeXmls,
    ensureCobrancaDownloadUrls,
    backfillCobrancaDownloadUrls,
    roundCobrancaForDisplay,
    roundDetalhesForDisplay,
    roundCustosAdicionaisForDisplay
} from '../../../services/firestoreService';
import type { CobrancaMensal, Cliente, TabelaPrecoItem, DetalheEnvio, CustoAdicional, ComprovanteDifal } from '../../../types';
import { useToast } from '../../../contexts/ToastContext';
import { FormInput, FormSelect } from '../../ui/FormControls';
import { FileUpload } from '../../ui/FileUpload';
import InvoicePdfDocument, { InvoicePdfDocumentRef } from '../../InvoicePdfDocument';

const formElementClasses = 'mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition text-gray-900 disabled:bg-gray-50 disabled:cursor-not-allowed';

interface EditableCellProps {
    value: number | string;
    onCommit: (val: string) => void;
    onPreviewChange?: (value: string) => void;
    type?: 'number' | 'text';
    placeholder?: string;
    className?: string;
    step?: string;
    min?: string;
}

const EditableCell: React.FC<EditableCellProps> = ({ value, onCommit, onPreviewChange, type = 'number', placeholder, className = '', step, min }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState('');
    const inputRef = React.useRef<HTMLInputElement>(null);

    const displayValue = value !== '' && value != null ? (typeof value === 'number' ? Number(Number(value).toFixed(2)) : value) : '';

    const startEditing = () => {
        setLocalValue(displayValue === '' ? '' : String(displayValue));
        setIsEditing(true);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const commit = () => {
        onPreviewChange?.('');
        onCommit(localValue);
        setIsEditing(false);
    };

    const cancel = () => {
        setLocalValue(displayValue === '' ? '' : String(displayValue));
        onPreviewChange?.('');
        setIsEditing(false);
    };

    React.useEffect(() => {
        if (!isEditing) setLocalValue(displayValue === '' ? '' : String(displayValue));
    }, [isEditing, displayValue]);

    if (isEditing) {
        return (
            <input
                ref={inputRef}
                type={type}
                value={localValue}
                onChange={(e) => {
                    setLocalValue(e.target.value);
                    onPreviewChange?.(e.target.value);
                }}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') cancel();
                }}
                placeholder={placeholder}
                className={`${formElementClasses} ${className}`}
                step={step}
                min={min}
            />
        );
    }
    return (
        <button
            type="button"
            onClick={startEditing}
            className={`min-h-[34px] w-full text-left px-3 py-2 border border-transparent rounded-md hover:border-gray-300 hover:bg-gray-50 text-sm ${className}`}
        >
            {displayValue === '' ? <span className="text-gray-400">{placeholder || '—'}</span> : displayValue}
        </button>
    );
};

// --- Invoice Editing Modal Component ---
interface EditInvoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (cobranca: CobrancaMensal, detalhes: DetalheEnvio[], custosAdicionais: CustoAdicional[]) => Promise<void>;
    cobranca: CobrancaMensal;
    cliente: Cliente | undefined;
    tabelaPrecos: TabelaPrecoItem[];
}

const EditInvoiceModal: React.FC<EditInvoiceModalProps> = ({ isOpen, onClose, onSave, cobranca: initialCobranca, cliente, tabelaPrecos }) => {
    const manualCostCategories: NonNullable<CustoAdicional['categoria']>[] = ['Armazenagem', 'Maquila/Entrada', 'Estoque', 'Logístico', 'Envios', 'Outro'];
    const [cobranca, setCobranca] = useState<CobrancaMensal>(initialCobranca);
    const [detalhes, setDetalhes] = useState<DetalheEnvio[]>([]);
    const [custosAdicionais, setCustosAdicionais] = useState<CustoAdicional[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [notaFiscalFile, setNotaFiscalFile] = useState<File | null>(null);
    const [isUploadingNotaFiscal, setIsUploadingNotaFiscal] = useState(false);
    const [totaisEditadosManualmente, setTotaisEditadosManualmente] = useState(false);
    const [previewOverride, setPreviewOverride] = useState<{ detalheIds: string[]; field: 'quantidade' | 'precoUnitarioManual'; value: string } | null>(null);
    const initialDetalhesRef = useRef<DetalheEnvio[]>([]);
    const initialCustosAdicionaisRef = useRef<CustoAdicional[]>([]);
    const { addToast } = useToast();
    const pdfRef = useRef<InvoicePdfDocumentRef>(null);
    const [showPriceTablePicker, setShowPriceTablePicker] = useState(false);
    const [priceTableSearchTerm, setPriceTableSearchTerm] = useState('');

    // Client-specific price table: load when modal opens; do not show global table before load
    const [localTabelaPrecos, setLocalTabelaPrecos] = useState<TabelaPrecoItem[]>([]);
    const [isLoadingTabelaPrecos, setIsLoadingTabelaPrecos] = useState(false);
    React.useEffect(() => {
        if (!isOpen) {
            setLocalTabelaPrecos([]);
            setIsLoadingTabelaPrecos(false);
            return;
        }
        if (cliente?.id) {
            setIsLoadingTabelaPrecos(true);
            getTabelaPrecos(cliente.id)
                .then((data) => {
                    setLocalTabelaPrecos(data);
                    setIsLoadingTabelaPrecos(false);
                })
                .catch(() => {
                    addToast('Não foi possível carregar a tabela de preços do cliente. Usando tabela padrão.', 'error');
                    setLocalTabelaPrecos(tabelaPrecos);
                    setIsLoadingTabelaPrecos(false);
                });
        } else {
            setLocalTabelaPrecos(tabelaPrecos);
            setIsLoadingTabelaPrecos(false);
        }
    }, [isOpen, cliente?.id, tabelaPrecos, addToast]);

    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    
    // State for view mode in details section
    const [detailsViewMode, setDetailsViewMode] = useState<'byCategory' | 'table'>('table');
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    
    const toggleCategory = (category: string) => {
        setExpandedCategories(prev => {
            const newSet = new Set(prev);
            if (newSet.has(category)) {
                newSet.delete(category);
            } else {
                newSet.add(category);
            }
            return newSet;
        });
    };
    
    // Group details by category with aggregation
    interface AggregatedItem {
        descricao: string;
        subcategoria: string;
        quantidade: number;
        subtotal: number;
        precoUnitario: number; // effective (avg or single) for display
        originalDetalheIds: string[];
        originalQuantidades: number[];
    }

    const groupedByCategory = useMemo(() => {
        const grouped: Record<string, { items: AggregatedItem[]; total: number }> = {};

        detalhes.forEach(detalhe => {
            if (!detalhe.tabelaPrecoItemId) return;
            const itemPreco = localTabelaPrecos.find(c => c.id === detalhe.tabelaPrecoItemId);
            if (!itemPreco) return;

            const group = detalhe.grupoManual ?? getCostCategoryGroupForItem(itemPreco);
            const category = group === 'custosAdicionais' ? 'Custos Adicionais' : group === 'envio' ? 'Envios' : group === 'armazenagem' ? 'Armazenagem' : group === 'logistico' ? 'Logístico' : (itemPreco.categoria || 'Outros');
            if (!grouped[category]) grouped[category] = { items: [], total: 0 };

            const quantidadeExibida = getQuantidadeUsoFatura(detalhe, itemPreco);
            const precoUnitario = getPrecoUnitarioDetalheFatura(detalhe, itemPreco);
            const subtotal = precoUnitario * quantidadeExibida;

            const displayDesc = getDisplayDescriptionForPriceItem(itemPreco.descricao);
            const existingItem = grouped[category].items.find(
                item => item.descricao === displayDesc && item.subcategoria === itemPreco.subcategoria
            );
            if (existingItem) {
                existingItem.quantidade += quantidadeExibida;
                existingItem.subtotal += subtotal;
                existingItem.originalDetalheIds.push(detalhe.id);
                existingItem.originalQuantidades.push(detalhe.quantidade);
            } else {
                grouped[category].items.push({
                    descricao: displayDesc,
                    subcategoria: itemPreco.subcategoria,
                    quantidade: quantidadeExibida,
                    subtotal,
                    precoUnitario,
                    originalDetalheIds: [detalhe.id],
                    originalQuantidades: [detalhe.quantidade]
                });
            }
            grouped[category].total += subtotal;
        });

        return Object.entries(grouped)
            .sort(([, a], [, b]) => b.total - a.total)
            .reduce((acc, [key, value]) => {
                acc[key] = value;
                return acc;
            }, {} as Record<string, { items: AggregatedItem[]; total: number }>);
    }, [detalhes, localTabelaPrecos]);
    
    // Handler for editing aggregated quantity - distributes proportionally
    const handleAggregatedQuantityChange = (category: string, itemIndex: number, newValue: string) => {
        const categoryData = groupedByCategory[category];
        if (!categoryData) return;
        const item = categoryData.items[itemIndex];
        if (!item) return;
        const newTotal = Math.round((parseFloat(newValue) || 0) * 100) / 100;
        const oldTotal = item.quantidade;
        const count = item.originalDetalheIds.length;
        setDetalhes(prev => {
            const updated = prev.map(d => {
                const detalheIndex = item.originalDetalheIds.indexOf(d.id);
                if (detalheIndex !== -1) {
                    let newQty: number;
                    if (oldTotal === 0) newQty = Math.round((newTotal / count) * 100) / 100;
                    else newQty = Math.round((item.originalQuantidades[detalheIndex] * (newTotal / oldTotal)) * 100) / 100;
                    return { ...d, quantidade: newQty };
                }
                return d;
            });
            recalculateTotals(updated, custosAdicionais, null);
            return updated;
        });
    };

    // Set same manual unit price on all detalhes in an aggregated row
    const handleAggregatedPrecoChange = (category: string, itemIndex: number, newValue: string) => {
        const categoryData = groupedByCategory[category];
        if (!categoryData) return;
        const item = categoryData.items[itemIndex];
        if (!item) return;
        const manual = newValue.trim() === '' ? undefined : Math.round((parseFloat(newValue) || 0) * 100) / 100;
        setDetalhes(prev => {
            const ids = new Set(item.originalDetalheIds);
            const updated = prev.map(d => (ids.has(d.id) ? { ...d, precoUnitarioManual: manual } : d));
            recalculateTotals(updated, custosAdicionais, null);
            return updated;
        });
    };

    const recalculateTotals = (currentDetalhes: DetalheEnvio[], currentCustosAdicionais: CustoAdicional[], previewOverrideArg?: { detalheIds: string[]; field: 'quantidade' | 'precoUnitarioManual'; value: string } | null, forceApplyTotals?: boolean) => {
        let workingDetalhes = currentDetalhes;
        if (previewOverrideArg?.detalheIds.length) {
            const ids = new Set(previewOverrideArg.detalheIds);
            const N = previewOverrideArg.detalheIds.length;
            const field = previewOverrideArg.field;
            const valueStr = previewOverrideArg.value;
            if (field === 'quantidade') {
                const parsed = parseFloat(valueStr) || 0;
                const perDetalhe = N > 0 ? Math.round((parsed / N) * 100) / 100 : 0;
                workingDetalhes = currentDetalhes.map(d =>
                    ids.has(d.id) ? { ...d, quantidade: perDetalhe } : d
                );
            } else {
                const parsed = valueStr.trim() === '' ? undefined : (parseFloat(valueStr) || 0);
                workingDetalhes = currentDetalhes.map(d =>
                    ids.has(d.id) ? { ...d, precoUnitarioManual: parsed } : d
                );
            }
        }

        const reembolsos = currentCustosAdicionais.filter(c => c.isReembolso);
        const totalReembolsos = reembolsos.reduce((sum, custo) => sum + custo.valor, 0);

        const r = recalculateCobrancaTotalsFromDetalhes(
            workingDetalhes,
            currentCustosAdicionais,
            localTabelaPrecos,
            initialCobranca.totalCustosExtras || 0,
            cobranca.totalEntradaMaterial ?? 0
        );
        const { totalEnvio, totalArmazenagem, totalCustosLogisticos, totalCustosAdicionais, totalCustosExtras, valorTotal, custoTotal } = r;

        if (!forceApplyTotals && totaisEditadosManualmente && !previewOverrideArg) {
            setCobranca(prev => ({
                ...prev,
                totalCustosExtras,
                custoTotal,
                valorTotal: prev.totalEnvio + prev.totalArmazenagem + prev.totalCustosLogisticos + totalCustosExtras + (prev.totalCustosAdicionais ?? 0) - totalReembolsos + (prev.totalEntradaMaterial ?? 0)
            }));
        } else {
            setCobranca(prev => ({ ...prev, totalEnvio, totalArmazenagem, totalCustosLogisticos, totalCustosAdicionais, totalCustosExtras, valorTotal, custoTotal }));
        }
    };

    React.useEffect(() => {
        if (isOpen) {
            setTotaisEditadosManualmente(false);
            setIsLoading(true);
            Promise.all([
                getDetalhesByCobrancaId(initialCobranca.id),
                getCustosAdicionaisByCobrancaId(initialCobranca.id)
            ]).then(([detalhesData, custosData]) => {
                const roundedDetalhes = roundDetalhesForDisplay(detalhesData);
                const roundedCustos = roundCustosAdicionaisForDisplay(custosData);
                initialDetalhesRef.current = roundedDetalhes;
                initialCustosAdicionaisRef.current = roundedCustos;
                setDetalhes(roundedDetalhes);
                setCustosAdicionais(roundedCustos);
            }).finally(() => setIsLoading(false));
            setCobranca(roundCobrancaForDisplay(initialCobranca));
        }
    }, [isOpen, initialCobranca]);

    React.useEffect(() => {
        if (previewOverride) recalculateTotals(detalhes, custosAdicionais, previewOverride);
    }, [previewOverride, detalhes, custosAdicionais]);

    const handleDetalheChange = (detalheId: string, field: keyof DetalheEnvio, value: any) => {
        const newDetalhes = detalhes.map(d => {
            if (d.id !== detalheId) return d;
            let updatedValue: unknown = value;
            if (field === 'quantidade') updatedValue = Math.round((parseFloat(value) || 0) * 100) / 100;
            if (field === 'precoUnitarioManual') {
                const v = typeof value === 'string' ? value.trim() : value;
                updatedValue = v === '' || v == null ? undefined : Math.round((parseFloat(String(v)) || 0) * 100) / 100;
            }
            if (field === 'grupoManual') {
                const v = typeof value === 'string' ? value.trim() : value;
                updatedValue = v === '' || v == null ? undefined : (v as 'envio' | 'armazenagem' | 'logistico' | 'custosAdicionais');
            }
            return { ...d, [field]: updatedValue };
        });
        setDetalhes(newDetalhes);
        recalculateTotals(newDetalhes, custosAdicionais, null);
    };

    const handleRevert = () => {
        const initialDetalhes = initialDetalhesRef.current ?? [];
        const initialCustos = initialCustosAdicionaisRef.current ?? [];
        setCobranca(roundCobrancaForDisplay(initialCobranca));
        setDetalhes(initialDetalhes);
        setCustosAdicionais(initialCustos);
        setPreviewOverride(null);
        setTotaisEditadosManualmente(false);
        recalculateTotals(initialDetalhes, initialCustos, null);
    };

    const handleDeleteDetalhe = (detalheId: string) => {
        const newDetalhes = detalhes.filter(d => d.id !== detalheId);
        setDetalhes(newDetalhes);
        recalculateTotals(newDetalhes, custosAdicionais, null);
    };

    const handleAddDetalhe = () => {
        const newItem: DetalheEnvio = {
            id: `new_${Date.now()}`,
            cobrancaId: cobranca.id,
            data: new Date().toISOString().split('T')[0],
            rastreio: '',
            codigoPedido: '',
            tabelaPrecoItemId: null,
            quantidade: 1,
        };
        const newDetalhes = [...detalhes, newItem];
        setDetalhes(newDetalhes);
        recalculateTotals(newDetalhes, custosAdicionais, null);
    };

    const handleDeleteAggregatedItem = (category: string, itemIndex: number) => {
        const categoryData = groupedByCategory[category];
        if (!categoryData) return;
        const item = categoryData.items[itemIndex];
        if (!item) return;
        const idsToDelete = new Set(item.originalDetalheIds);
        const newDetalhes = detalhes.filter(d => !idsToDelete.has(d.id));
        setDetalhes(newDetalhes);
        recalculateTotals(newDetalhes, custosAdicionais, null);
    };

    const handleAddFromPriceTable = (tabelaPrecoItemId: string) => {
        const newItem: DetalheEnvio = {
            id: `new_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            cobrancaId: cobranca.id,
            data: new Date().toISOString().split('T')[0],
            rastreio: '',
            codigoPedido: '',
            tabelaPrecoItemId,
            quantidade: 1,
        };
        const newDetalhes = [...detalhes, newItem];
        setDetalhes(newDetalhes);
        recalculateTotals(newDetalhes, custosAdicionais, null);
    };

    const handlePrintPdf = async () => {
        if (pdfRef.current) {
            await new Promise(resolve => setTimeout(resolve, 400));
            await pdfRef.current.generatePdf();
        }
    };

    const filteredPriceTableItems = useMemo(() => {
        if (!localTabelaPrecos.length) return {} as Record<string, TabelaPrecoItem[]>;
        const grouped: Record<string, TabelaPrecoItem[]> = {};
        localTabelaPrecos.forEach(item => {
            if (item.categoria === 'Custos Internos') return;
            if (item.descricao?.includes('(TP)')) return;
            const searchLower = priceTableSearchTerm.toLowerCase();
            if (searchLower &&
                !item.descricao.toLowerCase().includes(searchLower) &&
                !item.categoria.toLowerCase().includes(searchLower) &&
                !item.subcategoria.toLowerCase().includes(searchLower)) return;
            if (!grouped[item.categoria]) grouped[item.categoria] = [];
            grouped[item.categoria].push(item);
        });
        return grouped;
    }, [localTabelaPrecos, priceTableSearchTerm]);

    const handleCustoAdicionalChange = (id: string, field: keyof CustoAdicional, value: any) => {
        const newCustos = custosAdicionais.map(c => {
            if (c.id === id) {
                const updatedValue = field === 'valor' ? parseFloat(value) || 0 : value;
                return { ...c, [field]: updatedValue };
            }
            return c;
        });
        setCustosAdicionais(newCustos);
        recalculateTotals(detalhes, newCustos, null);
    };

    const handleAddCustoAdicional = () => {
        const newCusto: CustoAdicional = {
            id: `new_custo_${Date.now()}`,
            descricao: '',
            valor: 0,
            categoria: 'Outro'
        };
        const newCustos = [...custosAdicionais, newCusto];
        setCustosAdicionais(newCustos);
        recalculateTotals(detalhes, newCustos, null);
    };

    const handleDeleteCustoAdicional = (id: string) => {
        const newCustos = custosAdicionais.filter(c => c.id !== id);
        setCustosAdicionais(newCustos);
        recalculateTotals(detalhes, newCustos, null);
    };

    const handleUploadNotaFiscal = async () => {
        if (!notaFiscalFile) {
            addToast('Selecione um arquivo de nota fiscal.', 'error');
            return;
        }

        setIsUploadingNotaFiscal(true);
        try {
            const path = `notas-fiscais/${cobranca.clienteId}/${cobranca.id}/${Date.now()}_${notaFiscalFile.name}`;
            const url = await uploadFileToStorage(notaFiscalFile, path);
            await updateCobrancaWithNotaFiscal(cobranca.id, url, notaFiscalFile.name);
            setCobranca(prev => ({ ...prev, notaFiscalUrl: url, notaFiscalFileName: notaFiscalFile.name }));
            setNotaFiscalFile(null);
            addToast('Nota fiscal anexada com sucesso!', 'success');
        } catch (error) {
            console.error("Failed to upload nota fiscal:", error);
            addToast('Erro ao anexar nota fiscal.', 'error');
        } finally {
            setIsUploadingNotaFiscal(false);
        }
    };

    const handleRemoveNotaFiscal = async () => {
        if (!cobranca.notaFiscalUrl) return;

        if (!confirm('Tem certeza que deseja remover a nota fiscal?')) return;

        try {
            await deleteFileFromStorage(cobranca.notaFiscalUrl);
            setCobranca(prev => ({ ...prev, notaFiscalUrl: undefined, notaFiscalFileName: undefined }));
            addToast('Nota fiscal removida com sucesso!', 'success');
        } catch (error) {
            console.error("Failed to remove nota fiscal:", error);
            addToast('Erro ao remover nota fiscal.', 'error');
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        await onSave(cobranca, detalhes, custosAdicionais);
        setIsSaving(false);
    }
    
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                <header className="flex justify-between items-center p-4 border-b">
                    <h2 className="text-xl font-semibold text-gray-800">Editar Fatura: {cliente?.nome} - {cobranca.mesReferencia}</h2>
                    <div className="flex items-center gap-2">
                        <button onClick={handlePrintPdf} className="text-gray-500 hover:text-blue-600 p-1.5 rounded-md hover:bg-blue-50 transition-colors" title="Imprimir fatura (PDF)">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                        </button>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </header>
                <main className="flex-1 p-4 overflow-y-auto">
                    {isLoading ? <p>Carregando detalhes...</p> : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 p-4 border rounded-lg bg-gray-50">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Mês de Referência</label>
                                    <FormInput type="text" value={cobranca.mesReferencia} onChange={e => setCobranca(p => ({...p, mesReferencia: e.target.value}))} placeholder="Ex: Agosto/2024" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Data de Vencimento</label>
                                    <FormInput type="date" value={cobranca.dataVencimento} onChange={e => setCobranca(p => ({...p, dataVencimento: e.target.value}))} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Status</label>
                                    <FormSelect value={cobranca.status} onChange={e => setCobranca(p => ({...p, status: e.target.value as CobrancaMensal['status']}))}>
                                        <option value="Pendente">Pendente</option>
                                        <option value="Enviada">Enviada</option>
                                        <option value="Paga">Paga</option>
                                        <option value="Vencido">Vencido</option>
                                    </FormSelect>
                                </div>
                                <div className="sm:col-span-3">
                                    <label className="block text-sm font-medium text-gray-700">URL Planilha Conferência (Opcional)</label>
                                    <FormInput type="url" value={cobranca.urlPlanilhaConferencia || ''} onChange={e => setCobranca(p => ({...p, urlPlanilhaConferencia: e.target.value}))} placeholder="https://docs.google.com/spreadsheets/..." />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">
                                        Qtd. Envios (Display)
                                        <span className="text-xs text-gray-400 ml-1">(calculado: {cobranca.quantidadeEnvios || 0})</span>
                                    </label>
                                    <FormInput 
                                        type="number" 
                                        value={cobranca.quantidadeEnviosDisplay ?? cobranca.quantidadeEnvios ?? ''} 
                                        onChange={e => setCobranca(p => ({...p, quantidadeEnviosDisplay: e.target.value ? parseInt(e.target.value) : undefined}))} 
                                        placeholder="Quantidade para exibição"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700">Período de Cobrança</label>
                                    <FormInput 
                                        type="text" 
                                        value={cobranca.periodoCobranca || ''} 
                                        onChange={e => setCobranca(p => ({...p, periodoCobranca: e.target.value}))} 
                                        placeholder="Ex: 01/01/2026 a 31/01/2026"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-wrap items-end gap-2 mb-2">
                                <span className="text-sm text-gray-500">Totais editáveis; altere e salve. </span>
                                <button type="button" onClick={() => { setTotaisEditadosManualmente(false); recalculateTotals(detalhes, custosAdicionais, null, true); }} className="text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded">Recalcular</button>
                                <button type="button" onClick={handleRevert} disabled={isLoading} className="text-sm font-medium text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded disabled:opacity-50 disabled:cursor-not-allowed">Reverter alterações</button>
                                {totaisEditadosManualmente && <span className="text-xs text-amber-600">(valores manuais)</span>}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
                                <div className="bg-gray-100 p-4 rounded-lg">
                                    <p className="text-sm text-gray-600 mb-1">Total Envios</p>
                                    <FormInput type="number" step="0.01" min="0" className="text-lg font-bold w-full" value={cobranca.totalEnvio != null ? Number(cobranca.totalEnvio.toFixed(2)) : ''} onChange={e => { const v = parseFloat(e.target.value) || 0; setTotaisEditadosManualmente(true); setCobranca(prev => ({ ...prev, totalEnvio: v, valorTotal: v + (prev.totalArmazenagem ?? 0) + (prev.totalCustosLogisticos ?? 0) + (prev.totalCustosExtras ?? 0) + (prev.totalCustosAdicionais ?? 0) })); }} />
                                </div>
                                <div className="bg-gray-100 p-4 rounded-lg">
                                    <p className="text-sm text-gray-600 mb-1">Total Logística</p>
                                    <FormInput type="number" step="0.01" min="0" className="text-lg font-bold w-full" value={cobranca.totalCustosLogisticos != null ? Number(cobranca.totalCustosLogisticos.toFixed(2)) : ''} onChange={e => { const v = parseFloat(e.target.value) || 0; setTotaisEditadosManualmente(true); setCobranca(prev => ({ ...prev, totalCustosLogisticos: v, valorTotal: (prev.totalEnvio ?? 0) + (prev.totalArmazenagem ?? 0) + v + (prev.totalCustosExtras ?? 0) + (prev.totalCustosAdicionais ?? 0) })); }} />
                                </div>
                                <div className="bg-gray-100 p-4 rounded-lg">
                                    <p className="text-sm text-gray-600 mb-1">Total Armazenagem</p>
                                    <FormInput type="number" step="0.01" min="0" className="text-lg font-bold w-full" value={cobranca.totalArmazenagem != null ? Number(cobranca.totalArmazenagem.toFixed(2)) : ''} onChange={e => { const v = parseFloat(e.target.value) || 0; setTotaisEditadosManualmente(true); setCobranca(prev => ({ ...prev, totalArmazenagem: v, valorTotal: (prev.totalEnvio ?? 0) + v + (prev.totalCustosLogisticos ?? 0) + (prev.totalCustosExtras ?? 0) + (prev.totalCustosAdicionais ?? 0) })); }} />
                                </div>
                                <div className="bg-gray-100 p-4 rounded-lg">
                                    <p className="text-sm text-gray-600 mb-1">Custos Adicionais</p>
                                    <FormInput type="number" step="0.01" className="text-lg font-bold w-full" value={cobranca.totalCustosAdicionais != null ? Number(cobranca.totalCustosAdicionais.toFixed(2)) : ''} onChange={e => { const v = parseFloat(e.target.value) || 0; setTotaisEditadosManualmente(true); setCobranca(prev => ({ ...prev, totalCustosAdicionais: v, valorTotal: (prev.totalEnvio ?? 0) + (prev.totalArmazenagem ?? 0) + (prev.totalCustosLogisticos ?? 0) + (prev.totalCustosExtras ?? 0) + v })); }} />
                                </div>
                                <div className="bg-gray-100 p-4 rounded-lg">
                                    <p className="text-sm text-gray-600 mb-1">Total Entrada de Material (R$)</p>
                                    <FormInput type="number" step="0.01" min="0" className="text-lg font-bold w-full" value={cobranca.totalEntradaMaterial != null ? Number(cobranca.totalEntradaMaterial.toFixed(2)) : ''} onChange={e => { const raw = e.target.value; const v = raw === '' ? undefined : parseFloat(raw) || 0; setCobranca(prev => ({ ...prev, totalEntradaMaterial: v })); }} placeholder="Opcional" />
                                </div>
                                <div className="bg-blue-100 p-4 rounded-lg border border-blue-200">
                                    <p className="text-sm text-blue-700">Valor Total</p>
                                    <p className="text-xl font-bold text-blue-800">{formatCurrency(cobranca.valorTotal)}</p>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                {isLoadingTabelaPrecos ? (
                                    <div className="py-8 text-center text-gray-500">
                                        Carregando tabela de preços do cliente...
                                    </div>
                                ) : (
                                    <>
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="font-semibold text-gray-700">Itens da Tabela de Preços</h4>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setDetailsViewMode('byCategory')}
                                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                                detailsViewMode === 'byCategory'
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                            }`}
                                        >
                                            Por Categoria
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDetailsViewMode('table')}
                                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                                detailsViewMode === 'table'
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                            }`}
                                        >
                                            Tabela de Edição
                                        </button>
                                    </div>
                                </div>
                                
                                {detailsViewMode === 'byCategory' ? (
                                    <div className="space-y-3 mb-4">
                                        {Object.entries(groupedByCategory).map(([category, data]) => {
                                            const { items, total } = data as { items: AggregatedItem[]; total: number };
                                            const isExpanded = expandedCategories.has(category);
                                            return (
                                                <div key={category} className="border border-gray-200 rounded-lg overflow-hidden">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleCategory(category)}
                                                        className="w-full bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-150 px-4 py-2 flex items-center justify-between transition-colors"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <svg
                                                                xmlns="http://www.w3.org/2000/svg"
                                                                className={`h-4 w-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                                                viewBox="0 0 20 20"
                                                                fill="currentColor"
                                                            >
                                                                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                                            </svg>
                                                            <span className="font-medium text-gray-800">{category}</span>
                                                            <span className="text-xs text-gray-500">({items.length} {items.length === 1 ? 'item' : 'itens'})</span>
                                                        </div>
                                                        <span className="font-bold text-gray-900">{formatCurrency(total)}</span>
                                                    </button>
                                                    {isExpanded && (
                                                        <table className="min-w-full divide-y divide-gray-200">
                                                            <thead className="bg-gray-50">
                                                                <tr>
                                                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Serviço</th>
                                                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qtd.</th>
                                                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Preço Unit.</th>
                                                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Subtotal</th>
                                                                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase w-12"></th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="bg-white divide-y divide-gray-100">
                                                                {items.map((item, idx) => {
                                                                    const firstDetalhe = detalhes.find(d => d.id === item.originalDetalheIds[0]);
                                                                    const displayPreco = item.quantidade ? item.subtotal / item.quantidade : item.precoUnitario;
                                                                    const inputValue = firstDetalhe?.precoUnitarioManual != null ? Number(Number(firstDetalhe.precoUnitarioManual).toFixed(2)) : '';
                                                                    return (
                                                                        <tr key={`${item.descricao}-${idx}`}>
                                                                            <td className="px-3 py-2 text-sm text-gray-700">
                                                                                <span className="font-medium">{item.subcategoria}</span> - {item.descricao}
                                                                            </td>
                                                                            <td className="px-3 py-2 text-sm text-gray-600 text-right">
                                                                                <EditableCell
                                                                                    value={item.quantidade != null ? item.quantidade : ''}
                                                                                    onCommit={(val) => { setPreviewOverride(null); handleAggregatedQuantityChange(category, idx, val); }}
                                                                                    onPreviewChange={(v) => setPreviewOverride(v === '' ? null : { detalheIds: item.originalDetalheIds, field: 'quantidade', value: v })}
                                                                                    type="number"
                                                                                    className="w-24 text-xs p-1 text-right"
                                                                                    step="0.01"
                                                                                    min="0"
                                                                                    placeholder="0,00"
                                                                                />
                                                                            </td>
                                                                            <td className="px-3 py-2 text-sm text-gray-600 text-right">
                                                                                <EditableCell
                                                                                    value={inputValue !== '' && inputValue != null ? inputValue : ''}
                                                                                    onCommit={(val) => { setPreviewOverride(null); handleAggregatedPrecoChange(category, idx, val); }}
                                                                                    onPreviewChange={(v) => setPreviewOverride(v === '' ? null : { detalheIds: item.originalDetalheIds, field: 'precoUnitarioManual', value: v })}
                                                                                    type="number"
                                                                                    className="w-24 text-xs p-1 text-right"
                                                                                    step="0.01"
                                                                                    min="0"
                                                                                    placeholder={displayPreco.toFixed(2)}
                                                                                />
                                                                            </td>
                                                                            <td className="px-3 py-2 text-sm font-semibold text-gray-800 text-right">{formatCurrency(item.subtotal)}</td>
                                                                            <td className="px-3 py-2 text-center">
                                                                                <button type="button" onClick={() => handleDeleteAggregatedItem(category, idx)} className="text-red-400 hover:text-red-600 p-1 rounded-full hover:bg-red-50" title="Remover item">
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                                                                </button>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rastreio / Pedido</th>
                                            <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serviço</th>
                                            <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grupo</th>
                                            <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qtd.</th>
                                            <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase">Preço Unit.</th>
                                            <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase">Subtotal</th>
                                            <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {detalhes.map((d, detalheIdx) => {
                                            const itemPreco = localTabelaPrecos.find(c => c.id === d.tabelaPrecoItemId);
                                            const isPreviewForThis = previewOverride?.detalheIds.includes(d.id);
                                            const dPreview: DetalheEnvio = {
                                                ...d,
                                                ...(isPreviewForThis && previewOverride?.field === 'quantidade'
                                                    ? { quantidade: parseFloat(previewOverride.value) || 0 }
                                                    : {}),
                                                ...(isPreviewForThis && previewOverride?.field === 'precoUnitarioManual'
                                                    ? {
                                                          precoUnitarioManual:
                                                              previewOverride.value.trim() === ''
                                                                  ? undefined
                                                                  : (parseFloat(previewOverride.value) || 0),
                                                      }
                                                    : {}),
                                            };
                                            const precoUnitario =
                                                itemPreco != null
                                                    ? getPrecoUnitarioDetalheFatura(dPreview, itemPreco)
                                                    : 0;
                                            const quantidadeExibida =
                                                itemPreco != null ? getQuantidadeUsoFatura(dPreview, itemPreco) : 0;
                                            const subtotal = precoUnitario * quantidadeExibida;
                                            return (
                                                <tr key={`detalhe-${detalheIdx}-${d.id}`} className={!d.tabelaPrecoItemId ? 'bg-yellow-50' : ''}>
                                                    <td className="px-2 py-2 whitespace-nowrap text-sm"><FormInput type="text" value={d.rastreio} onChange={(e) => handleDetalheChange(d.id, 'rastreio', e.target.value)} placeholder="Rastreio/Info" className="w-40 text-xs p-1" /></td>
                                                    <td className="px-2 py-2 whitespace-nowrap text-sm"><FormSelect onChange={(e) => handleDetalheChange(d.id, 'tabelaPrecoItemId', e.target.value)} className={`w-full text-xs p-1 ${!d.tabelaPrecoItemId ? 'border-yellow-400' : ''}`} value={d.tabelaPrecoItemId || ""}><option value="" disabled>Selecione um serviço...</option>{localTabelaPrecos.map((c, oIdx) => <option key={`opt-${oIdx}-${c.id}`} value={c.id}>{`${c.subcategoria} - ${getDisplayDescriptionForPriceItem(c.descricao)}`}</option>)}</FormSelect></td>
                                                    <td className="px-2 py-2 whitespace-nowrap text-sm">
                                                        <FormSelect value={d.grupoManual ?? ''} onChange={(e) => handleDetalheChange(d.id, 'grupoManual', e.target.value || undefined)} className="w-full text-xs p-1" title="Auto = usa categoria da tabela">
                                                            <option value="">Auto</option>
                                                            <option value="envio">Envio</option>
                                                            <option value="armazenagem">Armazenagem</option>
                                                            <option value="logistico">Logístico</option>
                                                            <option value="custosAdicionais">Custos Adicionais</option>
                                                        </FormSelect>
                                                    </td>
                                                    <td className="px-2 py-2 whitespace-nowrap text-sm text-right">
                                                        <EditableCell
                                                            value={d.quantidade != null ? d.quantidade : ''}
                                                            onCommit={(val) => { setPreviewOverride(null); handleDetalheChange(d.id, 'quantidade', val); }}
                                                            onPreviewChange={(v) => setPreviewOverride(v === '' ? null : { detalheIds: [d.id], field: 'quantidade', value: v })}
                                                            type="number"
                                                            className="w-20 text-xs p-1 text-right"
                                                            step="0.01"
                                                            min="0"
                                                            placeholder="0,00"
                                                        />
                                                    </td>
                                                    <td className="px-2 py-2 whitespace-nowrap text-sm text-right">
                                                        <EditableCell
                                                            value={d.precoUnitarioManual != null ? d.precoUnitarioManual : ''}
                                                            onCommit={(val) => { setPreviewOverride(null); handleDetalheChange(d.id, 'precoUnitarioManual', val); }}
                                                            onPreviewChange={(v) => setPreviewOverride(v === '' ? null : { detalheIds: [d.id], field: 'precoUnitarioManual', value: v })}
                                                            type="number"
                                                            className="w-24 text-xs p-1 text-right"
                                                            step="0.01"
                                                            min="0"
                                                            placeholder={precoUnitario.toFixed(2)}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-2 whitespace-nowrap text-sm text-gray-800 font-semibold text-right">{formatCurrency(subtotal)}</td>
                                                    <td className="px-2 py-2 whitespace-nowrap text-sm text-center">
                                                        <button type="button" onClick={() => handleDeleteDetalhe(d.id)} className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg></button>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                                )}
                                <div className="mt-4 flex items-center gap-2">
                                    <button type="button" onClick={handleAddDetalhe} className="text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-md transition-colors flex items-center space-x-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                        <span>Adicionar Item Manual</span>
                                    </button>
                                    <button type="button" onClick={() => setShowPriceTablePicker(!showPriceTablePicker)} className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors flex items-center space-x-2 ${showPriceTablePicker ? 'bg-green-600 text-white' : 'text-green-600 hover:text-green-800 bg-green-100 hover:bg-green-200'}`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" /></svg>
                                        <span>Adicionar da Tabela de Preços</span>
                                    </button>
                                </div>
                                {showPriceTablePicker && (
                                    <div className="mt-3 border border-green-200 rounded-lg bg-green-50 p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h5 className="font-medium text-green-800">Tabela de Preços do Cliente</h5>
                                            <button type="button" onClick={() => { setShowPriceTablePicker(false); setPriceTableSearchTerm(''); }} className="text-gray-400 hover:text-gray-600">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                            </button>
                                        </div>
                                        <FormInput
                                            type="text"
                                            value={priceTableSearchTerm}
                                            onChange={(e) => setPriceTableSearchTerm(e.target.value)}
                                            placeholder="Buscar por descrição, categoria..."
                                            className="mb-3"
                                        />
                                        <div className="max-h-64 overflow-y-auto space-y-3">
                                            {Object.entries(filteredPriceTableItems).map(([category, items]: [string, TabelaPrecoItem[]]) => (
                                                <div key={category}>
                                                    <p className="text-xs font-semibold text-green-700 uppercase mb-1">{category}</p>
                                                    <div className="space-y-1">
                                                        {items.map((item, ptIdx) => (
                                                            <div key={`pt-${category}-${ptIdx}-${item.id}`} className="flex items-center justify-between bg-white rounded px-3 py-1.5 text-sm border border-green-100 hover:border-green-300 transition-colors">
                                                                <div className="flex-1 min-w-0">
                                                                    <span className="font-medium text-gray-800">{item.subcategoria}</span>
                                                                    <span className="text-gray-500"> - {getDisplayDescriptionForPriceItem(item.descricao)}</span>
                                                                    <span className="text-xs text-gray-400 ml-2">({item.metrica})</span>
                                                                </div>
                                                                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                                                    <span className="text-xs text-gray-500">{formatCurrency(item.precoVenda)}</span>
                                                                    <button type="button" onClick={() => handleAddFromPriceTable(item.id)} className="text-green-600 hover:text-green-800 bg-green-100 hover:bg-green-200 px-2 py-0.5 rounded text-xs font-medium transition-colors">
                                                                        + Adicionar
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                            {Object.keys(filteredPriceTableItems).length === 0 && (
                                                <p className="text-sm text-gray-500 text-center py-2">Nenhum item encontrado.</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                                    </>
                                )}
                            </div>
                            <div className="mt-6 pt-6 border-t">
                                <h4 className="font-semibold text-gray-700 mb-2">Custos Adicionais / Manuais</h4>
                                 <div className="space-y-2">
                                    {custosAdicionais.map((custo, custoIdx) => (
                                        <div key={`custo-${custoIdx}-${custo.id}`} className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
                                            <FormInput type="text" value={custo.descricao} onChange={(e) => handleCustoAdicionalChange(custo.id, 'descricao', e.target.value)} placeholder="Descrição do Custo" className="flex-grow text-sm"/>
                                            <FormSelect
                                                value={custo.categoria || 'Outro'}
                                                onChange={(e) => handleCustoAdicionalChange(custo.id, 'categoria', e.target.value)}
                                                className="w-40 text-sm"
                                            >
                                                {manualCostCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                            </FormSelect>
                                            <FormInput type="number" value={custo.valor} onChange={(e) => handleCustoAdicionalChange(custo.id, 'valor', e.target.value)} placeholder="Valor (R$)" className="w-32 text-sm text-right" step="0.01"/>
                                            <button type="button" onClick={() => handleDeleteCustoAdicional(custo.id)} className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg></button>
                                        </div>
                                    ))}
                                </div>
                                <button type="button" onClick={handleAddCustoAdicional} className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-md transition-colors flex items-center space-x-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                    <span>Adicionar Custo Adicional</span>
                                </button>
                            </div>
                            <div className="mt-6 pt-6 border-t">
                                <h4 className="font-semibold text-gray-700 mb-4">Documentos e Pagamento</h4>
                                <div className="space-y-4">
                                    <div>
                                        <FileUpload
                                            id="nota-fiscal-edit"
                                            label="Nota Fiscal"
                                            accept="application/pdf,image/*"
                                            maxSizeMB={10}
                                            onFileSelect={setNotaFiscalFile}
                                            file={notaFiscalFile}
                                            isUploading={isUploadingNotaFiscal}
                                        />
                                        {cobranca.notaFiscalUrl && (
                                            <div className="mt-2 p-3 bg-green-50 rounded-md flex items-center justify-between">
                                                <div className="flex items-center space-x-2">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900">{cobranca.notaFiscalFileName || 'Nota fiscal anexada'}</p>
                                                        <a href={cobranca.notaFiscalUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800">Ver arquivo</a>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={handleRemoveNotaFiscal}
                                                    className="text-red-600 hover:text-red-800 text-sm"
                                                >
                                                    Remover
                                                </button>
                                            </div>
                                        )}
                                        {notaFiscalFile && (
                                            <button
                                                type="button"
                                                onClick={handleUploadNotaFiscal}
                                                disabled={isUploadingNotaFiscal}
                                                className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 text-sm"
                                            >
                                                {isUploadingNotaFiscal ? 'Enviando...' : 'Anexar Nota Fiscal'}
                                            </button>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Link de Pagamento (Opcional)</label>
                                        <FormInput
                                            type="url"
                                            value={cobranca.urlLinkPagamento || ''}
                                            onChange={e => setCobranca(p => ({...p, urlLinkPagamento: e.target.value}))}
                                            placeholder="https://..."
                                        />
                                        <p className="mt-1 text-xs text-gray-500">URL para página de pagamento ou boleto</p>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">URL da Nota Fiscal (metadado)</label>
                                            <FormInput type="url" value={cobranca.notaFiscalUrl || ''} onChange={e => setCobranca(p => ({...p, notaFiscalUrl: e.target.value || undefined}))} placeholder="https://..." />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Nome do arquivo da Nota Fiscal</label>
                                            <FormInput type="text" value={cobranca.notaFiscalFileName || ''} onChange={e => setCobranca(p => ({...p, notaFiscalFileName: e.target.value || undefined}))} placeholder="Nome do arquivo" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="mt-6 pt-6 border-t">
                                <h4 className="font-semibold text-gray-700 mb-2">Downloads dos relatórios</h4>
                                <p className="text-xs text-gray-500 mb-2">Arquivos gerados para o cliente (disponíveis no PDF e no portal).</p>
                                <div className="space-y-2 mb-4 p-3 bg-gray-50 rounded-md border border-gray-200">
                                    {cobranca.trackReportDownloadUrl ? (
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-gray-800">Relatório de Rastreio (Track Report)</span>
                                            <a href={cobranca.trackReportDownloadUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 font-medium">Download</a>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between text-sm text-gray-500">
                                            <span>Relatório de Rastreio (Track Report)</span>
                                            <span>Não gerado</span>
                                        </div>
                                    )}
                                    {cobranca.orderDetailListagemDownloadUrl ? (
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-gray-800">Relatório de Envios (Order Detail – listagem)</span>
                                            <a href={cobranca.orderDetailListagemDownloadUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 font-medium">Download</a>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between text-sm text-gray-500">
                                            <span>Relatório de Envios (Order Detail – listagem)</span>
                                            <span>Não gerado</span>
                                        </div>
                                    )}
                                    {cobranca.arquivosComplementares?.map((arq, i) => (
                                        <div key={i} className="flex items-center justify-between">
                                            <span className="text-sm text-gray-800 truncate max-w-[240px]">{arq.nome}</span>
                                            <a href={arq.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap">Download</a>
                                        </div>
                                    ))}
                                </div>
                                <h4 className="font-semibold text-gray-700 mb-2">Dados Técnicos</h4>
                                <p className="text-xs text-gray-500 mb-2">Conteúdo bruto dos relatórios (CSV). Alterar aqui afeta apenas o armazenamento; não recalcula a fatura.</p>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Relatório Rastreio (CSV)</label>
                                        <textarea
                                            className="w-full h-32 p-2 border border-gray-300 rounded-md text-xs font-mono"
                                            value={cobranca.relatorioRastreioCSV || ''}
                                            onChange={e => setCobranca(p => ({...p, relatorioRastreioCSV: e.target.value || undefined}))}
                                            placeholder="Conteúdo CSV do rastreio..."
                                            spellCheck={false}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Relatório Custos (CSV)</label>
                                        <textarea
                                            className="w-full h-32 p-2 border border-gray-300 rounded-md text-xs font-mono"
                                            value={cobranca.relatorioCustosCSV || ''}
                                            onChange={e => setCobranca(p => ({...p, relatorioCustosCSV: e.target.value || undefined}))}
                                            placeholder="Conteúdo CSV de custos..."
                                            spellCheck={false}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="mt-6 pt-6 border-t">
                                <h4 className="font-semibold text-gray-700 mb-2">Comprovantes DIFAL</h4>
                                <div className="space-y-2">
                                    {(cobranca.comprovantesDifal && cobranca.comprovantesDifal.length > 0) ? (
                                        <ul className="divide-y divide-gray-200 border rounded-md">
                                            {cobranca.comprovantesDifal.map((c: ComprovanteDifal) => (
                                                <li key={c.chaveNFe} className="px-3 py-2 flex items-center justify-between text-sm">
                                                    <span className="font-mono text-xs truncate flex-1 mr-2">{c.chaveNFe}</span>
                                                    <span className="text-gray-500">{c.xmlFileName}</span>
                                                    <button type="button" onClick={() => setCobranca(p => ({...p, comprovantesDifal: (p.comprovantesDifal || []).filter(x => x.chaveNFe !== c.chaveNFe)}))} className="ml-2 text-red-600 hover:text-red-800 p-1 rounded">Remover</button>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-sm text-gray-500">Nenhum comprovante DIFAL.</p>
                                    )}
                                    <div className="pt-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Adicionar XML(s) de NF-e (DIFAL)</label>
                                        <input
                                            type="file"
                                            accept=".xml,application/xml,text/xml"
                                            multiple
                                            className="block w-full text-sm text-gray-600 file:mr-2 file:py-1 file:px-3 file:rounded file:border file:border-gray-300 file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                                            onChange={async (e) => {
                                                const files = e.target.files;
                                                if (!files?.length) return;
                                                const contents: Array<{ content: string; fileName: string }> = [];
                                                for (let i = 0; i < files.length; i++) {
                                                    const f = files[i];
                                                    const content = await f.text();
                                                    contents.push({ content, fileName: f.name });
                                                }
                                                const parsed = parseMultipleNFeXmls(contents);
                                                if (parsed.length === 0) {
                                                    addToast('Nenhum comprovante DIFAL válido encontrado nos XMLs.', 'warning');
                                                    e.target.value = '';
                                                    return;
                                                }
                                                const withIds = parsed.map(c => ({ ...c, cobrancaId: cobranca.id, clienteId: cobranca.clienteId }));
                                                const existing = cobranca.comprovantesDifal || [];
                                                const byChave = new Map(existing.map(x => [x.chaveNFe, x]));
                                                withIds.forEach(c => byChave.set(c.chaveNFe, c));
                                                setCobranca(p => ({ ...p, comprovantesDifal: Array.from(byChave.values()) }));
                                                addToast(`${parsed.length} comprovante(s) DIFAL adicionado(s).`, 'success');
                                                e.target.value = '';
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </main>
                <InvoicePdfDocument
                    ref={pdfRef}
                    cobranca={cobranca}
                    detalhes={detalhes}
                    custosAdicionais={custosAdicionais}
                    tabelaPrecos={localTabelaPrecos}
                    client={cliente}
                    trackReportDownloadUrl={cobranca.trackReportDownloadUrl}
                    orderDetailListagemDownloadUrl={cobranca.orderDetailListagemDownloadUrl}
                    arquivosComplementares={cobranca.arquivosComplementares}
                />
                <footer className="flex justify-between bg-gray-50 p-4 border-t">
                    <button type="button" onClick={handlePrintPdf} className="bg-blue-50 text-blue-700 px-4 py-2 rounded-md hover:bg-blue-100 font-medium flex items-center gap-2 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                        Imprimir PDF
                    </button>
                    <div className="flex space-x-3">
                        <button type="button" onClick={onClose} disabled={isSaving} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 font-medium">Cancelar</button>
                        <button type="button" onClick={handleSave} disabled={isSaving || isLoading} className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 font-medium disabled:bg-green-300">
                            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}

// --- Local Confirmation Modal Component ---
const ConfirmDeleteModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    isDeleting: boolean;
    cobranca: CobrancaMensal | null;
    clienteNome: string | undefined;
}> = ({ isOpen, onClose, onConfirm, isDeleting, cobranca, clienteNome }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="p-6 text-center">
                    <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                        <svg className="h-6 w-6 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h3 className="text-lg mt-3 font-medium text-gray-900">Confirmar Exclusão</h3>
                    <p className="mt-2 text-sm text-gray-500">
                        Tem certeza que deseja excluir a fatura de <strong>{cobranca?.mesReferencia}</strong> para o cliente <strong>{clienteNome}</strong>? Esta ação é permanente.
                    </p>
                </div>
                <div className="bg-gray-50 px-4 py-3 sm:px-6 flex flex-row-reverse rounded-b-lg">
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isDeleting}
                        className="w-full sm:w-auto inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 sm:ml-3 disabled:bg-red-300"
                    >
                        {isDeleting ? 'Excluindo...' : 'Excluir'}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isDeleting}
                        className="w-full sm:w-auto mt-3 sm:mt-0 inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};


// --- Main View Component ---
interface BillingArchiveViewProps {
    cobrancas: CobrancaMensal[];
    clientes: Cliente[];
    tabelaPrecos: TabelaPrecoItem[];
    onUpdate: () => void;
}

const BillingArchiveView: React.FC<BillingArchiveViewProps> = ({ cobrancas, clientes, tabelaPrecos, onUpdate }) => {
    const [editingCobranca, setEditingCobranca] = useState<CobrancaMensal | null>(null);
    const [cobrancaToDelete, setCobrancaToDelete] = useState<CobrancaMensal | null>(null);
    const [isConfirmDeleteModalOpen, setIsConfirmDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [filters, setFilters] = useState({ clientId: 'all', month: 'all' });
    const backfillRunRef = useRef(false);
    const { addToast } = useToast();
    const archivePdfRef = useRef<InvoicePdfDocumentRef>(null);

    useEffect(() => {
        if (backfillRunRef.current) return;
        backfillRunRef.current = true;
        backfillCobrancaDownloadUrls()
            .then((n) => {
                if (n > 0) {
                    addToast(`${n} fatura(s) com links de download disponibilizados.`, 'success');
                    onUpdate();
                }
            })
            .catch(() => {
                addToast('Erro ao disponibilizar arquivos de faturas existentes.', 'error');
            });
    }, [addToast, onUpdate]);
    const [printingInvoice, setPrintingInvoice] = useState<{
        cobranca: CobrancaMensal;
        detalhes: DetalheEnvio[];
        custosAdicionais: CustoAdicional[];
        clientTabelaPrecos: TabelaPrecoItem[];
        cliente: Cliente | undefined;
    } | null>(null);
    const [isPrinting, setIsPrinting] = useState(false);
    
    const monthMap: { [key: string]: number } = { 'janeiro': 0, 'fevereiro': 1, 'março': 2, 'abril': 3, 'maio': 4, 'junho': 5, 'julho': 6, 'agosto': 7, 'setembro': 8, 'outubro': 9, 'novembro': 10, 'dezembro': 11 };

    const sortedCobrancas = useMemo(() => 
        cobrancas.sort((a, b) => new Date(b.dataVencimento).getTime() - new Date(a.dataVencimento).getTime()), 
    [cobrancas]);

    const availableMonths = useMemo(() =>
        [...new Set(cobrancas.map(c => c.mesReferencia).filter(Boolean))]
        .sort((a: string, b: string) => {
            try {
                const [mesA, anoA] = a.split('/');
                const [mesB, anoB] = b.split('/');
                const monthIndexA = monthMap[mesA.toLowerCase()];
                const monthIndexB = monthMap[mesB.toLowerCase()];

                if (monthIndexA === undefined || monthIndexB === undefined) {
                    return a.localeCompare(b);
                }

                const dateA = new Date(parseInt(anoA), monthIndexA, 1);
                const dateB = new Date(parseInt(anoB), monthIndexB, 1);
                
                if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
                    return a.localeCompare(b);
                }

                return dateB.getTime() - dateA.getTime();
            } catch (e) {
                console.error(`Error sorting month strings "${a}" and "${b}":`, e);
                return a.localeCompare(b);
            }
        }),
    [cobrancas]);

    const filteredCobrancas = useMemo(() => {
        return sortedCobrancas.filter(c => {
            const clientMatch = filters.clientId === 'all' || c.clienteId === filters.clientId;
            const monthMatch = filters.month === 'all' || c.mesReferencia === filters.month;
            return clientMatch && monthMatch;
        });
    }, [sortedCobrancas, filters]);

    const handleEdit = (cobranca: CobrancaMensal) => {
        setEditingCobranca(cobranca);
    };

    const handleSaveEdit = async (cobranca: CobrancaMensal, detalhes: DetalheEnvio[], custosAdicionais: CustoAdicional[]) => {
        try {
            const urlUpdates = await ensureCobrancaDownloadUrls(cobranca);
            const cobrancaWithUrls = { ...cobranca, ...urlUpdates };
            await salvarCobrancaEditada(cobrancaWithUrls, detalhes, custosAdicionais);
            addToast('Fatura atualizada com sucesso!', 'success');
            onUpdate();
            setEditingCobranca(null);
        } catch (error) {
            console.error("Failed to save edited invoice:", error);
            addToast(`Erro ao salvar: ${error instanceof Error ? error.message : String(error)}`, 'error');
        }
    };

    const handleStatusChange = async (cobrancaId: string, newStatus: CobrancaMensal['status']) => {
        try {
            await updateCobrancaStatus(cobrancaId, newStatus);
            addToast('Status da fatura atualizado.', 'success');
            onUpdate();
        } catch (error) {
            console.error('Failed to update status:', error);
            addToast('Erro ao atualizar status.', 'error');
        }
    };
    
    const handleDeleteClick = (cobranca: CobrancaMensal) => {
        setCobrancaToDelete(cobranca);
        setIsConfirmDeleteModalOpen(true);
    };
    
     const handleCopyLink = (url: string) => {
        navigator.clipboard.writeText(url).then(() => {
            addToast('Link copiado para a área de transferência!', 'success');
        }, (err) => {
            addToast('Falha ao copiar o link.', 'error');
            console.error('Could not copy text: ', err);
        });
    };

    const handleConfirmDelete = async () => {
        if (!cobrancaToDelete) return;
        setIsDeleting(true);
        try {
            await deleteCobranca(cobrancaToDelete.id);
            addToast('Fatura excluída com sucesso!', 'success');
            onUpdate();
        } catch (error) {
            console.error("Failed to delete invoice:", error);
            addToast(`Erro ao excluir: ${error instanceof Error ? error.message : String(error)}`, 'error');
        } finally {
            setIsConfirmDeleteModalOpen(false);
            setCobrancaToDelete(null);
            setIsDeleting(false);
        }
    };

    const handlePrintFromArchive = async (cobranca: CobrancaMensal) => {
        setIsPrinting(true);
        try {
            const [detalhesData, custosData, clientTabelaPrecos] = await Promise.all([
                getDetalhesByCobrancaId(cobranca.id),
                getCustosAdicionaisByCobrancaId(cobranca.id),
                getTabelaPrecos(cobranca.clienteId)
            ]);
            const cliente = clientes.find(c => c.id === cobranca.clienteId);
            setPrintingInvoice({ cobranca, detalhes: detalhesData, custosAdicionais: custosData, clientTabelaPrecos, cliente });
        } catch (error) {
            addToast('Erro ao carregar dados para impressão.', 'error');
            setIsPrinting(false);
        }
    };

    useEffect(() => {
        if (printingInvoice && archivePdfRef.current) {
            const generate = async () => {
                try {
                    await archivePdfRef.current?.generatePdf();
                    addToast('PDF gerado com sucesso!', 'success');
                } catch (e) {
                    addToast('Erro ao gerar PDF.', 'error');
                }
                setPrintingInvoice(null);
                setIsPrinting(false);
            };
            setTimeout(generate, 500);
        }
    }, [printingInvoice]);

    const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    const formatDate = (dateString: string) => new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');

    const statusStyles: Record<CobrancaMensal['status'], { selectBg: string }> = {
        'Paga': { selectBg: 'bg-green-100' },
        'Pendente': { selectBg: 'bg-yellow-100' },
        'Vencido': { selectBg: 'bg-red-100' },
        'Enviada': { selectBg: 'bg-blue-100' },
    };


    return (
        <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
            <h3 className="text-2xl font-bold text-gray-900">Arquivo de Cobranças</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormSelect value={filters.clientId} onChange={e => setFilters(f => ({...f, clientId: e.target.value}))}>
                    <option value="all">Todos os Clientes</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </FormSelect>
                <FormSelect value={filters.month} onChange={e => setFilters(f => ({...f, month: e.target.value}))}>
                    <option value="all">Todos os Meses</option>
                    {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
                </FormSelect>
            </div>
             <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mês/Ano</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Valor</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                             <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Link</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredCobrancas.map((c, cobrancaIdx) => {
                            const cliente = clientes.find(cli => cli.id === c.clienteId);
                            return (
                                <tr key={`cobranca-${cobrancaIdx}-${c.id}`}>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{cliente?.nome || 'N/A'}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{c.mesReferencia}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-800 font-semibold text-right">{formatCurrency(c.valorTotal)}</td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-center">
                                         <FormSelect 
                                            value={c.status} 
                                            onChange={(e) => handleStatusChange(c.id, e.target.value as CobrancaMensal['status'])}
                                            className={`text-xs p-1 rounded-md border-gray-300 focus:ring-blue-500 focus:border-blue-500 font-medium ${statusStyles[c.status].selectBg}`}
                                        >
                                            <option value="Pendente">Pendente</option>
                                            <option value="Enviada">Enviada</option>
                                            <option value="Paga">Paga</option>
                                            <option value="Vencido">Vencido</option>
                                        </FormSelect>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-center">
                                        {(() => {
                                            // Generate link dynamically if not saved in database
                                            const shareLink = c.urlCompartilhamento || getShareableUrl(c.clienteId, c.id);
                                            return (
                                                <button onClick={() => handleCopyLink(shareLink)} className="text-blue-600 hover:text-blue-800 p-1.5 rounded-md hover:bg-blue-50 transition-colors" title="Copiar link de compartilhamento">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M8 4a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" /><path d="M6 3a2 2 0 012-2h4a2 2 0 012 2v2a2 2 0 01-2 2H8a2 2 0 01-2-2V3z" /><path d="M9 9a1 1 0 00-1 1v6a1 1 0 102 0v-6a1 1 0 00-1-1z" /><path d="M9 7a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" /></svg>
                                                </button>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-right space-x-2">
                                        <span className="text-gray-500">{formatDate(c.dataVencimento)}</span>
                                        <button onClick={() => handlePrintFromArchive(c)} disabled={isPrinting} className="text-blue-600 hover:text-blue-900 disabled:text-gray-400" title="Imprimir PDF">Imprimir</button>
                                        <button onClick={() => handleEdit(c)} className="text-indigo-600 hover:text-indigo-900">Editar</button>
                                        <button onClick={() => handleDeleteClick(c)} className="text-red-600 hover:text-red-900">Excluir</button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {editingCobranca && (
                <EditInvoiceModal
                    isOpen={!!editingCobranca}
                    onClose={() => setEditingCobranca(null)}
                    onSave={handleSaveEdit}
                    cobranca={editingCobranca}
                    cliente={clientes.find(c => c.id === editingCobranca.clienteId)}
                    tabelaPrecos={tabelaPrecos}
                />
            )}
            
            <ConfirmDeleteModal 
                isOpen={isConfirmDeleteModalOpen}
                onClose={() => setIsConfirmDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                isDeleting={isDeleting}
                cobranca={cobrancaToDelete}
                clienteNome={clientes.find(c => c.id === cobrancaToDelete?.clienteId)?.nome}
            />

            {printingInvoice && (
                <InvoicePdfDocument
                    ref={archivePdfRef}
                    cobranca={printingInvoice.cobranca}
                    detalhes={printingInvoice.detalhes}
                    custosAdicionais={printingInvoice.custosAdicionais}
                    tabelaPrecos={printingInvoice.clientTabelaPrecos}
                    client={printingInvoice.cliente}
                    trackReportDownloadUrl={printingInvoice.cobranca.trackReportDownloadUrl}
                    orderDetailListagemDownloadUrl={printingInvoice.cobranca.orderDetailListagemDownloadUrl}
                    arquivosComplementares={printingInvoice.cobranca.arquivosComplementares}
                />
            )}
        </div>
    );
};

export default BillingArchiveView;