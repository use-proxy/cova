// P01b — shared Cova email styling. Navy ground, ivory text, gold accents,
// italic serif headlines, uppercase tracked microtype.

import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

const NAVY = "#0A1628";
const IVORY = "#F5F0E8";
const GOLD = "#C9A84C";
const TEXT_SECONDARY = "#8BA3C0";

const bodyStyle = {
  backgroundColor: NAVY,
  margin: 0,
  padding: 0,
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
  color: IVORY,
};

const containerStyle = {
  maxWidth: "560px",
  margin: "0 auto",
  padding: "48px 32px",
};

const wordmarkStyle = {
  color: IVORY,
  fontSize: "14px",
  letterSpacing: "0.4em",
  textTransform: "uppercase" as const,
  margin: 0,
};

const goldDashStyle = {
  width: "32px",
  height: "1px",
  backgroundColor: GOLD,
  opacity: 0.5,
  border: 0,
  margin: "8px 0 48px 0",
};

const headlineStyle = {
  fontFamily: "'EB Garamond', Georgia, serif",
  fontStyle: "italic" as const,
  fontSize: "32px",
  lineHeight: 1.2,
  color: IVORY,
  margin: "0 0 24px 0",
};

const textStyle = {
  fontSize: "15px",
  lineHeight: 1.6,
  color: IVORY,
  margin: "0 0 16px 0",
};

const ctaButtonStyle = {
  display: "inline-block",
  backgroundColor: GOLD,
  color: NAVY,
  padding: "14px 32px",
  fontSize: "12px",
  letterSpacing: "0.3em",
  textTransform: "uppercase" as const,
  textDecoration: "none",
  fontWeight: 600,
  margin: "24px 0",
};

const footerTextStyle = {
  fontSize: "12px",
  letterSpacing: "0.05em",
  color: TEXT_SECONDARY,
  lineHeight: 1.6,
  margin: "8px 0",
};

const fallbackLinkStyle = {
  color: GOLD,
  fontSize: "13px",
  wordBreak: "break-all" as const,
};

interface EmailLayoutProps {
  preview: string;
  headline: string;
  children: ReactNode;
}

export function EmailLayout({ preview, headline, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={wordmarkStyle}>COVA</Text>
          <Hr style={goldDashStyle} />
          <Text style={headlineStyle}>{headline}</Text>
          {children}
          <Hr
            style={{
              borderColor: "#1E3A5F",
              margin: "48px 0 24px 0",
            }}
          />
          <Section>
            <Text style={footerTextStyle}>
              You're receiving this email from Cova.
            </Text>
            <Text style={footerTextStyle}>
              <Link href="https://covainterior.com" style={{ color: TEXT_SECONDARY }}>
                covainterior.com
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const styles = {
  text: textStyle,
  cta: ctaButtonStyle,
  fallbackLink: fallbackLinkStyle,
  footer: footerTextStyle,
  navy: NAVY,
  ivory: IVORY,
  gold: GOLD,
};
