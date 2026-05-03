import { Button, Text } from "@react-email/components";
import { EmailLayout, styles } from "./_shared";

interface GdprExportReadyEmailProps {
  downloadUrl: string;
  expiresAtIso: string;
}

export function GdprExportReadyEmail({
  downloadUrl,
  expiresAtIso,
}: GdprExportReadyEmailProps) {
  return (
    <EmailLayout
      preview="Your Cova data export is ready"
      headline="Your data is ready."
    >
      <Text style={styles.text}>
        We've packaged your Cova data — rooms, renders, swipes, and final images.
      </Text>
      <Button href={downloadUrl} style={styles.cta}>
        DOWNLOAD YOUR DATA
      </Button>
      <Text style={styles.text}>
        If the button doesn't work, paste this link into your browser:
      </Text>
      <Text style={styles.fallbackLink}>{downloadUrl}</Text>
      <Text style={styles.footer}>
        This link expires {new Date(expiresAtIso).toUTCString()}.
      </Text>
    </EmailLayout>
  );
}

export default GdprExportReadyEmail;
