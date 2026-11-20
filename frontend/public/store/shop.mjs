export const products = [
  { id: 'condoms', name: 'Condoms', unit: '12 pack', cents: 2499 },
  { id: 'lube', name: 'Lube', unit: '250 mL', cents: 2999 },
  { id: 'nylon-hood', name: 'Nylon hood', unit: 'Each', cents: 3999 },
  { id: 'blindfold', name: 'Blindfold', unit: 'Each', cents: 1999 }
];

const currency = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
export const money = cents => currency.format(cents / 100);
export const subtotal = bag => products.reduce(
  (sum, product) => sum + product.cents * (bag.get(product.id) ?? 0), 0
);

export const shipping = bag => subtotal(bag) > 0 ? 999 : 0;
