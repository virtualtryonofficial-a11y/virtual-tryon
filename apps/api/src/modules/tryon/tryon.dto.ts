import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class CreateTryonDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsNotEmpty()
  userImage!: string;

  @IsString()
  @IsOptional()
  signature?: string;

  @IsNumber()
  @IsOptional()
  timestamp?: number;

  @IsString()
  @IsOptional()
  productImageUrl?: string;
}

export interface TryonResponse {
  jobId: string;
}

export interface TryonStatusResponse {
  status: string;
  imageUrl?: string;
  previewImage?: string; // keep for backward compatibility
  previewImageUrl?: string;
  requiresLeadCapture?: boolean;
  unlockRequired?: boolean;
  unlockToken?: string;
  expiresAt?: string;
  compliment?: string;
  styleScore?: number;
  complimentCached?: boolean;
}

