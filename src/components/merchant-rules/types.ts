export interface MerchantRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface RuleFormPayload {
  pattern: string;
  normalized_name: string;
  category_name: string;
}
