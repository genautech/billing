import React, { useRef, useImperativeHandle, useMemo, forwardRef } from 'react';
import type { CobrancaMensal, DetalheEnvio, TabelaPrecoItem, Cliente, CustoAdicional } from '../types';
import {
    getPrecoUnitarioDetalheFatura,
    getQuantidadeUsoFatura,
    getDisplayDescriptionForPriceItem,
    createFindItemPreco,
} from '../services/firestoreService';

declare const jspdf: any;
declare const html2canvas: any;

export interface InvoicePdfDocumentRef {
    generatePdf: (suggestedFileName?: string) => Promise<void>;
}

export interface InvoicePdfDocumentProps {
    cobranca: CobrancaMensal;
    detalhes: DetalheEnvio[];
    custosAdicionais: CustoAdicional[];
    tabelaPrecos: TabelaPrecoItem[];
    client: Cliente | undefined;
    templateHeaderText?: string;
    templateFooterText?: string;
    templateNotesText?: string;
    trackReportLineCount?: number;
    orderDetailLineCount?: number;
    periodoDetectado?: string;
    trackReportDownloadUrl?: string;
    orderDetailListagemDownloadUrl?: string;
    arquivosComplementares?: { nome: string; url: string }[];
}

const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const formatDate = (dateString: string) =>
    new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');

const InvoicePdfDocument = forwardRef<InvoicePdfDocumentRef, InvoicePdfDocumentProps>(
    (
        {
            cobranca,
            detalhes,
            custosAdicionais,
            tabelaPrecos,
            client,
            templateHeaderText,
            templateFooterText,
            templateNotesText,
            trackReportLineCount,
            orderDetailLineCount,
            periodoDetectado,
            trackReportDownloadUrl,
            orderDetailListagemDownloadUrl,
            arquivosComplementares,
        },
        ref
    ) => {
        const pdfTemplateRef = useRef<HTMLDivElement>(null);

        const findItemPreco = useMemo(() => createFindItemPreco(tabelaPrecos), [tabelaPrecos]);

        const getPrecoItemInfo = (id: string | null, context?: { codigoPedido?: string; quantidade?: number }): TabelaPrecoItem | undefined =>
            id ? findItemPreco(id, context) : undefined;

        const categoryTotals = useMemo(() => {
            const totals: Record<string, number> = {
                Envios: cobranca.totalEnvio,
                'Custos Logísticos': cobranca.totalCustosLogisticos,
                Armazenamento: cobranca.totalArmazenagem,
            };
            if (cobranca.totalCustosExtras && cobranca.totalCustosExtras > 0) {
                totals['Custos Extras do Pedido'] = cobranca.totalCustosExtras;
            }
            const reembolsos = custosAdicionais.filter(c => c.isReembolso);
            const totalReembolsos = reembolsos.reduce((sum, c) => sum + c.valor, 0);
            const custosAdicionaisTotal = cobranca.totalCustosAdicionais ?? 0;
            if (custosAdicionaisTotal > 0) totals['Custos Adicionais'] = custosAdicionaisTotal;
            if (totalReembolsos > 0) totals['Reembolsos'] = -totalReembolsos;
            return Object.entries(totals)
                .filter(([, total]) => Math.abs(total) > 0.001)
                .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a));
        }, [cobranca, custosAdicionais]);

        const filteredDetalhes = useMemo(() => {
            return detalhes.filter(detalhe => {
                const itemPreco = findItemPreco(detalhe.tabelaPrecoItemId, {
                    codigoPedido: detalhe.codigoPedido,
                    quantidade: detalhe.quantidade,
                });
                if (!itemPreco) return true;
                const isShippingItem = itemPreco.categoria === 'Envios' || itemPreco.categoria === 'Retornos';
                if (isShippingItem) return true;
                const catLower = itemPreco.categoria.toLowerCase();
                if (catLower.includes('armazenamento') || catLower.includes('armazenagem')) return true;
                const isDifalItem =
                    itemPreco.categoria === 'Difal' || itemPreco.descricao?.toLowerCase().includes('difal');
                if (isDifalItem) return true;
                if (itemPreco.categoria === 'Custos Internos') return false;
                return true;
            });
        }, [detalhes, findItemPreco]);

        useImperativeHandle(ref, () => ({
            generatePdf: async (suggestedFileName?: string) => {
                const target = pdfTemplateRef.current;
                if (!target) return;

                const { jsPDF } = jspdf;
                const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

                const MAX_CANVAS_HEIGHT = 16000;
                const contentHeight = target.scrollHeight;
                const contentWidth = target.scrollWidth;
                let scale = 2;
                if (contentHeight * scale > MAX_CANVAS_HEIGHT) {
                    scale = Math.max(0.5, MAX_CANVAS_HEIGHT / contentHeight);
                }

                const canvas = await html2canvas(target, {
                    scale,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff',
                    windowWidth: contentWidth,
                    windowHeight: contentHeight,
                });

                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();
                const marginLeft = 15;
                const marginRight = 15;
                const marginTop = 15;
                const marginBottom = 20;
                const imgWidth = pdfWidth - marginLeft - marginRight;
                const pageContentHeight = pdfHeight - marginTop - marginBottom;

                const totalImgHeightMm = (canvas.height * imgWidth) / canvas.width;
                const numPages = Math.ceil(totalImgHeightMm / pageContentHeight);

                for (let p = 0; p < numPages; p++) {
                    if (p > 0) pdf.addPage();

                    const startPx = (p * pageContentHeight / totalImgHeightMm) * canvas.height;
                    let slicePx = (pageContentHeight / totalImgHeightMm) * canvas.height;
                    if (startPx + slicePx > canvas.height) slicePx = canvas.height - startPx;

                    const sourceY = Math.floor(startPx);
                    const sourceH = Math.max(1, Math.min(Math.ceil(slicePx), canvas.height - sourceY));

                    const sliceCanvas = document.createElement('canvas');
                    sliceCanvas.width = canvas.width;
                    sliceCanvas.height = sourceH;
                    const sliceCtx = sliceCanvas.getContext('2d');
                    if (sliceCtx) {
                        sliceCtx.fillStyle = '#ffffff';
                        sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
                        sliceCtx.drawImage(
                            canvas,
                            0, sourceY, canvas.width, sourceH,
                            0, 0, canvas.width, sourceH
                        );
                    }
                    const sliceDataUrl = sliceCanvas.toDataURL('image/png');
                    const sliceHeightMm = (sourceH * imgWidth) / canvas.width;
                    pdf.addImage(sliceDataUrl, 'PNG', marginLeft, marginTop, imgWidth, sliceHeightMm);
                }

                const downloadLinks: { label: string; url: string }[] = [];
                if (trackReportDownloadUrl) downloadLinks.push({ label: 'Relatório de Rastreio (Track Report)', url: trackReportDownloadUrl });
                if (orderDetailListagemDownloadUrl) downloadLinks.push({ label: 'Relatório de Envios (Order Detail – listagem)', url: orderDetailListagemDownloadUrl });
                (arquivosComplementares || []).forEach((arq) => downloadLinks.push({ label: arq.nome, url: arq.url }));

                if (downloadLinks.length > 0) {
                    pdf.addPage();
                    pdf.setFontSize(14);
                    pdf.text('Arquivos complementares', marginLeft, marginTop + 10);
                    pdf.setFontSize(10);
                    let y = marginTop + 20;
                    for (const item of downloadLinks) {
                        pdf.setTextColor(0, 0, 0);
                        pdf.text(`${item.label}: `, marginLeft, y);
                        const linkWidth = pdf.getTextWidth('Download');
                        const labelWidth = pdf.getTextWidth(`${item.label}: `);
                        if (typeof pdf.textWithLink === 'function') {
                            pdf.setTextColor(0, 0, 255);
                            pdf.textWithLink('Download', marginLeft + labelWidth, y, { url: item.url });
                            pdf.setTextColor(0, 0, 0);
                        } else {
                            pdf.text(`Download (${item.url})`, marginLeft + labelWidth, y);
                        }
                        y += 8;
                    }
                }

                const safeMonth = cobranca.mesReferencia.replace(/[^a-z0-9]/gi, '-');
                const fileName =
                    suggestedFileName ||
                    `fatura-${(client?.nome || 'cliente').toLowerCase().replace(/\s+/g, '-')}-${safeMonth}.pdf`;
                pdf.save(fileName);
            },
        }));

        return (
            <div
                ref={pdfTemplateRef}
                aria-hidden="true"
                style={{
                    position: 'absolute',
                    left: '-9999px',
                    top: 0,
                    width: '190mm',
                    maxWidth: '190mm',
                    pointerEvents: 'none',
                    boxSizing: 'border-box',
                }}
                className="bg-white text-gray-900"
            >
                <div style={{ padding: '12mm 10mm', boxSizing: 'border-box' }} className="space-y-6">
                    <header className="border-b border-gray-300 pb-4 mb-4">
                        <div className="flex justify-between items-start gap-4">
                            <div className="min-w-0 flex-1">
                                <p className="text-xs text-gray-500 mb-0.5">Yoobe Logistics</p>
                                <h1 className="text-xl font-bold text-gray-900 mb-2">Fatura – {cobranca.mesReferencia}</h1>
                                <p className="text-sm text-gray-600 leading-tight">
                                    Cliente: {client?.nome || 'N/A'}
                                </p>
                                <p className="text-sm text-gray-600 leading-tight">
                                    CNPJ: {client?.cnpj || 'N/A'}
                                </p>
                                <p className="text-sm text-gray-600 leading-tight">
                                    Vencimento: {formatDate(cobranca.dataVencimento)}
                                    {cobranca.status ? ` · Status: ${cobranca.status}` : ''}
                                </p>
                                {cobranca.periodoCobranca && (
                                    <p className="text-sm text-gray-600 leading-tight">
                                        Período: {cobranca.periodoCobranca}
                                    </p>
                                )}
                                {templateHeaderText && (
                                    <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
                                        {templateHeaderText}
                                    </div>
                                )}
                            </div>
                            <div className="text-right flex-shrink-0">
                                {client?.logoUrl && (
                                    <img
                                        src={client.logoUrl}
                                        alt=""
                                        className="h-12 w-auto object-contain mb-2"
                                        crossOrigin="anonymous"
                                    />
                                )}
                                <p className="text-sm font-semibold text-gray-700">Valor Total</p>
                                <p className="text-2xl font-bold text-blue-700">
                                    {formatCurrency(cobranca.valorTotal)}
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                            {categoryTotals.map(([categoria, total]) => (
                                <div
                                    key={categoria}
                                    className="flex flex-col border border-gray-200 rounded px-3 py-2 bg-gray-50 min-w-0"
                                >
                                    <span className="text-gray-600 text-left block leading-tight break-words">
                                        {categoria}
                                    </span>
                                    <span className="font-semibold text-gray-800 text-left block mt-1">
                                        {categoria === 'Reembolsos'
                                            ? `- ${formatCurrency(Math.abs(total))}`
                                            : formatCurrency(total)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </header>

                    <section className="space-y-2">
                        <h2 className="text-base font-semibold text-gray-800 border-b border-gray-200 pb-1">Detalhamento dos Itens</h2>
                        <table className="w-full text-xs border border-gray-200 border-collapse">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="px-3 py-2 text-left font-medium text-gray-600 border border-gray-200">Data</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-600 border border-gray-200">Pedido</th>
                                    <th className="px-3 py-2 text-left font-medium text-gray-600 border border-gray-200">Serviço</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-600 border border-gray-200">Qtd.</th>
                                    <th className="px-3 py-2 text-right font-medium text-gray-600 border border-gray-200">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredDetalhes.map((detalhe, di) => {
                                    const itemPreco = getPrecoItemInfo(detalhe.tabelaPrecoItemId, {
                                        codigoPedido: detalhe.codigoPedido,
                                        quantidade: detalhe.quantidade,
                                    });
                                    if (!itemPreco) return null;
                                    const precoUnitario = getPrecoUnitarioDetalheFatura(detalhe, itemPreco);
                                    const quantidadeExibida = getQuantidadeUsoFatura(detalhe, itemPreco);
                                    const subtotal = precoUnitario * quantidadeExibida;
                                    return (
                                        <tr key={`detalhe-${di}-${detalhe.id}`}>
                                            <td className="px-3 py-2 text-gray-600 border border-gray-100">
                                                {formatDate(detalhe.data)}
                                            </td>
                                            <td className="px-3 py-2 text-gray-800 border border-gray-100">{detalhe.codigoPedido}</td>
                                            <td className="px-3 py-2 text-gray-700 border border-gray-100">
                                                {`${itemPreco.subcategoria} - ${getDisplayDescriptionForPriceItem(itemPreco.descricao)}`}
                                            </td>
                                            <td className="px-3 py-2 text-right text-gray-700 border border-gray-100">
                                                {quantidadeExibida}
                                            </td>
                                            <td className="px-3 py-2 text-right font-semibold text-gray-900 border border-gray-100">
                                                {formatCurrency(subtotal)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </section>

                    <section className="space-y-2">
                        <h3 className="text-sm font-semibold text-gray-800">Arquivos complementares</h3>
                        <div className="text-sm text-gray-700 border border-gray-200 rounded-lg p-3 bg-gray-50">
                            {trackReportDownloadUrl ? (
                                <p className="mb-1">
                                    Relatório de Rastreio (Track Report):{' '}
                                    <a href={trackReportDownloadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Download</a>
                                </p>
                            ) : (
                                <p className="mb-1">
                                    Relatório de Rastreio (Track Report):{' '}
                                    {trackReportLineCount != null && trackReportLineCount > 0 ? `incluído (${trackReportLineCount} linhas)` : 'não informado'}
                                </p>
                            )}
                            {orderDetailListagemDownloadUrl ? (
                                <p className="mb-1">
                                    Relatório de Envios (Order Detail – listagem):{' '}
                                    <a href={orderDetailListagemDownloadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Download</a>
                                </p>
                            ) : (
                                <p className="mb-1">
                                    Relatório de Envios (Order Detail):{' '}
                                    {orderDetailLineCount != null && orderDetailLineCount > 0 ? `incluído (${orderDetailLineCount} linhas)` : 'não informado'}
                                </p>
                            )}
                            {arquivosComplementares?.map((arq, i) => (
                                <p key={i} className="mb-1">
                                    {arq.nome}: <a href={arq.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Download</a>
                                </p>
                            ))}
                            {periodoDetectado && (
                                <p className="mb-0">
                                    <span className="font-medium">Período detectado:</span> {periodoDetectado}
                                </p>
                            )}
                        </div>
                    </section>

                    <section
                        className="grid grid-cols-1 md:grid-cols-2 gap-4"
                        style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                    >
                        <div className="space-y-2" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                            <h3 className="text-sm font-semibold text-amber-800">Custos Adicionais</h3>
                            <table className="w-full text-xs border border-amber-200 border-collapse">
                                <thead className="bg-amber-50">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-amber-700 border border-amber-200">Descrição</th>
                                        <th className="px-3 py-2 text-left text-amber-700 border border-amber-200">Categoria</th>
                                        <th className="px-3 py-2 text-right text-amber-700 border border-amber-200">Valor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-amber-100">
                                    {custosAdicionais
                                        .filter(c => !c.isReembolso)
                                        .map((custo, ci) => (
                                            <tr key={`custo-${ci}-${custo.id}`}>
                                                <td className="px-3 py-2 text-gray-800 border border-amber-100">{getDisplayDescriptionForPriceItem(custo.descricao)}</td>
                                                <td className="px-3 py-2 text-gray-600 border border-amber-100">
                                                    {custo.categoria || '-'}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-amber-800 border border-amber-100">
                                                    {formatCurrency(custo.valor)}
                                                </td>
                                            </tr>
                                        ))}
                                    {custosAdicionais.filter(c => !c.isReembolso).length === 0 && (
                                        <tr>
                                            <td className="px-3 py-2 text-gray-500 border border-amber-100" colSpan={3}>
                                                Nenhum custo adicional.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="space-y-2" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                            <h3 className="text-sm font-semibold text-emerald-800">Reembolsos / Entradas</h3>
                            <table className="w-full text-xs border border-emerald-200 border-collapse">
                                <thead className="bg-emerald-50">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-emerald-700 border border-emerald-200">Descrição</th>
                                        <th className="px-3 py-2 text-left text-emerald-700 border border-emerald-200">Motivo / Tipo</th>
                                        <th className="px-3 py-2 text-right text-emerald-700 border border-emerald-200">Valor</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-emerald-100">
                                    {custosAdicionais
                                        .filter(c => c.isReembolso)
                                        .map((custo, ci) => (
                                            <tr key={`custo-reemb-${ci}-${custo.id}`}>
                                                <td className="px-3 py-2 text-emerald-800 font-medium border border-emerald-100">
                                                    {getDisplayDescriptionForPriceItem(custo.descricao)}
                                                </td>
                                                <td className="px-3 py-2 text-gray-600 border border-emerald-100">
                                                    {custo.motivoReembolso || '-'}
                                                </td>
                                                <td className="px-3 py-2 text-right font-bold text-emerald-800 border border-emerald-100">
                                                    - {formatCurrency(custo.valor)}
                                                </td>
                                            </tr>
                                        ))}
                                    {filteredDetalhes
                                        .filter(d => d.codigoPedido === 'ENTRADA DE MATERIAL')
                                        .map((detalhe, di) => {
                                            const itemPreco = getPrecoItemInfo(detalhe.tabelaPrecoItemId, {
                                                codigoPedido: detalhe.codigoPedido,
                                                quantidade: detalhe.quantidade,
                                            });
                                            const precoUnitario = itemPreco
                                                ? getPrecoUnitarioDetalheFatura(detalhe, itemPreco)
                                                : 0;
                                            const quantidadeExibida = itemPreco
                                                ? getQuantidadeUsoFatura(detalhe, itemPreco)
                                                : 0;
                                            const subtotal = precoUnitario * quantidadeExibida;
                                            return (
                                                <tr key={`detalhe-entrada-${di}-${detalhe.id}`}>
                                                    <td className="px-3 py-2 text-indigo-800 font-medium border border-emerald-100">
                                                        {getDisplayDescriptionForPriceItem(itemPreco?.descricao ?? '') || 'Entrada de Material'}
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-600 border border-emerald-100">
                                                        Entrada de Material
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-semibold text-indigo-800 border border-emerald-100">
                                                        {formatCurrency(subtotal)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    {custosAdicionais.filter(c => c.isReembolso).length === 0 &&
                                        filteredDetalhes.filter(d => d.codigoPedido === 'ENTRADA DE MATERIAL')
                                            .length === 0 && (
                                            <tr>
                                                <td className="px-3 py-2 text-gray-500 border border-emerald-100" colSpan={3}>
                                                    Nenhum reembolso ou entrada.
                                                </td>
                                            </tr>
                                        )}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="text-sm text-gray-700 pt-2">
                        <h3 className="text-sm font-semibold text-gray-800 mb-1">Notas</h3>
                        <p className="mb-0">
                            {templateNotesText ||
                                'Os valores de envio variam conforme rota, peso e ofertas de transportadoras. Custos adicionais e reembolsos já estão considerados no total.'}
                        </p>
                    </section>

                    {templateFooterText && (
                        <footer className="text-xs text-gray-600 border-t border-gray-200 pt-3 mt-4 whitespace-pre-wrap">
                            {templateFooterText}
                        </footer>
                    )}
                </div>
            </div>
        );
    }
);

InvoicePdfDocument.displayName = 'InvoicePdfDocument';

export default InvoicePdfDocument;
