import { IsString, IsNotEmpty, IsBoolean, IsOptional, Matches } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @IsNotEmpty()
  tryonRequestId!: string;

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\+?[1-9]\d{1,14}$/, { message: 'PhoneNumber must be a valid phone format (digits only or leading +)' })
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\+?\d{1,4}$/, { message: 'CountryCode must be a valid dial code (e.g., +1, +91)' })
  countryCode?: string;

  @IsBoolean()
  @IsOptional()
  marketingConsent?: boolean;

  @IsOptional()
  metadata?: any;
}

export class TrackEventDto {
  @IsString()
  @IsNotEmpty()
  event!: string;

  @IsOptional()
  metadata?: any;
}

export class UnlockTryonDto {
  @IsString()
  @IsNotEmpty()
  unlockToken!: string;
}

export interface LeadResponse {
  success: boolean;
  leadId: string;
  unlockToken: string;
  requiresLeadCapture: boolean;
}
