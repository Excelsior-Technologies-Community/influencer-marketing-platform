export const rolePath = role => ({ SUPER_ADMIN: '/admin', BRAND_ADMIN: '/brand', CREATOR: '/creator' })[role] || '/';
