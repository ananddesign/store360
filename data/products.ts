import type { VRProduct } from '@/types/vr';

/**
 * V1 product catalogue — static placeholder data.
 *
 * ⚠️  REPLACE-ME: this is where the QWEEN product API should eventually be
 * connected. Keep the `VRProduct` shape (or map the API response into it) so
 * nothing downstream changes. Images use the procedural placeholder scheme
 * ("placeholder://<key>") until real product photography is available; swap
 * `image` for a real URL such as "/vr/products/solitaire.jpg".
 */
export const products: VRProduct[] = [
  {
    id: 'qween-solitaire-001',
    name: 'Signature Solitaire',
    price: 185000,
    currency: 'INR',
    image: 'placeholder://ring',
    spec: '0.50 CT · VS · G',
    description: 'A signature QWEEN solitaire, cut for maximum brilliance.',
    category: 'Rings',
    pdpUrl: 'https://qween.com/products/signature-solitaire',
  },
  {
    id: 'qween-riviere-002',
    name: 'Rivière Necklace',
    price: 1250000,
    currency: 'INR',
    image: 'placeholder://necklace',
    spec: '7.20 CT · VVS · F',
    description: 'A graduated line of round brilliants in a seamless rivière.',
    category: 'Necklaces',
    pdpUrl: 'https://qween.com/products/riviere-necklace',
  },
  {
    id: 'qween-eternity-003',
    name: 'Eternity Band',
    price: 320000,
    currency: 'INR',
    image: 'placeholder://band',
    spec: '1.50 CT · VS · G',
    description: 'A full circle of matched diamonds — light from every angle.',
    category: 'Rings',
    pdpUrl: 'https://qween.com/products/eternity-band',
  },
  {
    id: 'qween-drop-004',
    name: 'Pear Drop Earrings',
    price: 540000,
    currency: 'INR',
    image: 'placeholder://earrings',
    spec: '2.00 CT · VVS · E',
    description: 'Pear-cut drops suspended for gentle, catching movement.',
    category: 'Earrings',
    pdpUrl: 'https://qween.com/products/pear-drop-earrings',
  },
];

/** Fast lookup used by the product panel + hotspot manager. */
const productIndex = new Map(products.map((p) => [p.id, p]));

export function getProductById(id: string): VRProduct | undefined {
  return productIndex.get(id);
}
