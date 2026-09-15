import { useEffect } from 'react';

/**
 * Custom hook to dynamically manage document title, meta descriptions, and Open Graph tags.
 * Ensures every page has clear, professional, and accessible titles and descriptions.
 * 
 * @param {string} title - Page title
 * @param {string} [description] - Optional meta description
 */
export function usePageMeta(title, description) {
  useEffect(() => {
    const baseTitle = 'VendorOS';
    const fullTitle = title ? `${title} | ${baseTitle}` : baseTitle;
    document.title = fullTitle;

    if (description) {
      let metaDescription = document.querySelector('meta[name="description"]');
      if (!metaDescription) {
        metaDescription = document.createElement('meta');
        metaDescription.name = 'description';
        document.head.appendChild(metaDescription);
      }
      metaDescription.setAttribute('content', description);

      let ogDescription = document.querySelector('meta[property="og:description"]');
      if (ogDescription) {
        ogDescription.setAttribute('content', description);
      }
    }
  }, [title, description]);
}

export default usePageMeta;
