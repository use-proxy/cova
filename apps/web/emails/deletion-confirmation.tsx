import { Text } from "@react-email/components";
import { EmailLayout, styles } from "./_shared";

export function DeletionConfirmationEmail() {
  return (
    <EmailLayout
      preview="Your Cova account has been deleted"
      headline="Your Cova account has been deleted."
    >
      <Text style={styles.text}>
        Your account, rooms, and renders have been permanently removed from our systems.
      </Text>
      <Text style={styles.text}>
        We kept a small audit record (a hashed identifier and timestamp only — no email,
        no other personal data) for 30 days, after which it is automatically purged.
      </Text>
      <Text style={styles.footer}>
        If you ever want to come back, you can sign up again at any time.
      </Text>
    </EmailLayout>
  );
}

export default DeletionConfirmationEmail;
