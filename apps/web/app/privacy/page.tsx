import LegalPage from "@/components/legal/LegalPage";

const PLACEHOLDER_HTML = `<p>This document is coming soon. Contact <a href="mailto:hi@covainterior.com">hi@covainterior.com</a> if you have questions.</p>`;

export const metadata = {
  title: "Privacy Policy — Cova",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      documentType="privacy"
      documentTitle="Privacy Policy"
      htmlContent={PLACEHOLDER_HTML}
      lastUpdatedISO="2026-05-03"
      effectiveDateISO="2026-05-03"
      version="0.1"
    />
  );
}
