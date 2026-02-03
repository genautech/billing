const fs = require('fs');

function parseCSVLine(line) {
    const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
    return line.split(regex).map(v => v.trim().replace(/^"|"$/g, ''));
}

const file = "/Users/genautech/Downloads/order_detail (9).csv";
const content = fs.readFileSync(file, 'utf-8');
const lines = content.trim().split('\n');
const headers = parseCSVLine(lines[0]);

const costs = {
    picking: [],
    packing: [],
    material: [],
    shipping: [],
    difal: []
};

for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]);
    if (row.length < headers.length) continue;
    
    costs.picking.push(parseFloat(row[19]) || 0);
    costs.packing.push(parseFloat(row[22]) || 0);
    costs.material.push(parseFloat(row[23]) || 0);
    costs.shipping.push(parseFloat(row[25]) || 0);
    costs.difal.push(parseFloat(row[28]) || 0);
}

function avg(arr) {
    const nonZero = arr.filter(v => v > 0);
    if (nonZero.length === 0) return 0;
    return nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
}

function max(arr) {
    return Math.max(...arr, 0);
}

console.log('--- Resumo de Custos Cubbo (Order Detail) ---');
console.log('Picking:', { avg: avg(costs.picking).toFixed(2), max: max(costs.picking).toFixed(2) });
console.log('Packing:', { avg: avg(costs.packing).toFixed(2), max: max(costs.packing).toFixed(2) });
console.log('Material:', { avg: avg(costs.material).toFixed(2), max: max(costs.material).toFixed(2) });
console.log('Shipping (Variável):', { avg: avg(costs.shipping).toFixed(2), max: max(costs.shipping).toFixed(2) });
console.log('Difal:', { avg: avg(costs.difal).toFixed(2), max: max(costs.difal).toFixed(2) });
