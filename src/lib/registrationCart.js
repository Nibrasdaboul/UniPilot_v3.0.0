const CART_KEY = 'unipilot_section_cart';

export function readRegistrationCart() {
  try {
    const raw = sessionStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(Number).filter((id) => Number.isFinite(id)) : [];
  } catch {
    return [];
  }
}

export function writeRegistrationCart(ids) {
  const unique = [...new Set((ids || []).map(Number).filter((id) => Number.isFinite(id)))];
  sessionStorage.setItem(CART_KEY, JSON.stringify(unique));
  return unique;
}

export function addToRegistrationCart(catalogId) {
  const id = Number(catalogId);
  const current = readRegistrationCart();
  if (!current.includes(id)) current.push(id);
  return writeRegistrationCart(current);
}

export function removeFromRegistrationCart(catalogId) {
  const id = Number(catalogId);
  return writeRegistrationCart(readRegistrationCart().filter((item) => item !== id));
}

export function toggleRegistrationCart(catalogId) {
  const id = Number(catalogId);
  const current = readRegistrationCart();
  return current.includes(id) ? removeFromRegistrationCart(id) : addToRegistrationCart(id);
}

export function clearRegistrationCart() {
  return writeRegistrationCart([]);
}
