// Harga booth mengikuti Katalog Template: the same matching as the server (see shared/templatePrice.js, AGENTS.md §32)
import { BOOTH_CATEGORIES } from './floorplanUtils';
import { resolveTemplatePrice, discountAmountOf } from '../../../shared/templatePrice.js';

export * from '../../../shared/templatePrice.js';

/** Katalog Template as the Studio holds it (Master Tier, refreshed by updateBoothCategoriesRegistry). */
export const studioCatalog = () => Object.values(BOOTH_CATEGORIES);

/**
 * What changes on a booth that follows its template: the template price of its size and, for a percentage discount,
 * the discount amount. null when the booth has Harga Khusus, is locked by an invoice, has no / a conflicting
 * template, or already has that price.
 */
export function templateFollowProps(boothData, catalog = studioCatalog()) {
  if (!boothData || boothData.priceMode !== 'template' || boothData.priceLocked) return null;
  const r = resolveTemplatePrice(boothData, catalog);
  if (r.status !== 'match' || r.price === Math.round(Number(boothData.price) || 0)) return null;
  return { price: r.price, discountAmount: discountAmountOf(r.price, boothData.discountType, boothData.discountValue) };
}
