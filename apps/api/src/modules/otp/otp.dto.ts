import { IsString, IsNotEmpty } from 'class-validator';

export class ResendOtpDto {
  @IsString()
  @IsNotEmpty()
  otpSessionId!: string;
}

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  otpSessionId!: string;

  @IsString()
  @IsNotEmpty()
  otp!: string;
}
