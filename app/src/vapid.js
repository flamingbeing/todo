// The Web Push public key (VAPID): public by design, the page subscribes with it. Its private half is the Worker's secret
// VAPID_PRIVATE_KEY (never in this repo); the Worker (worker/sites.js) signs with the pair.
export const VAPID_PUBLIC_KEY = 'BLrelXcKi_Fvc1idau07ytYa0j1Zcn-Xomh28jHCyDgcL0UGIMYUOWAdFUj3QKCJL15JmUfbFMC-QQ5_msHlUVs';
