import LegalPage from "@/components/legal/LegalPage";

const PLACEHOLDER_HTML = `<p>This document is coming soon. Contact <a href="mailto:hi@covainterior.com">hi@covainterior.com</a> if you have questions.</p>`;

export const metadata = {
  title: "Terms of Service — Cova",
};

export default function TermsPage() {
  return (
    <LegalPage
      documentType="terms"
      documentTitle="Terms of Service"
      htmlContent={PLACEHOLDER_HTML}
      lastUpdatedISO="2026-05-03"
      effectiveDateISO="2026-05-03"
      version="0.1"
    />
  );
}
