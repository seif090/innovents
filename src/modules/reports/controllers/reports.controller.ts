import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ReportsService } from '../services/reports.service';
import { CreateReportDto } from '../dto/create-report.dto';
import { ReportQueryDto } from '../dto/report-query.dto';
import { ReportResponseDto, PaginatedReportsDto } from '../dto/report-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Reports')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Submit a content or user violation report' })
  @ApiResponse({
    status: 201,
    description: 'Report successfully submitted',
    type: ReportResponseDto,
  })
  @ApiConflictResponse({ description: 'An active report already exists for this resource' })
  @ApiNotFoundResponse({ description: 'Target resource does not exist or is not reportable' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async createReport(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateReportDto,
    @Req() req: Request,
  ): Promise<ReportResponseDto> {
    return this.reportsService.createReport(
      userId,
      dto,
      req.ip,
      req.headers['user-agent'] as string,
    );
  }

  @Get('my')
  @ApiOperation({ summary: 'Retrieve violation reports submitted by current user' })
  @ApiResponse({ status: 200, description: 'Paginated user reports', type: PaginatedReportsDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async getMyReports(
    @CurrentUser('sub') userId: string,
    @Query() query: ReportQueryDto,
  ): Promise<PaginatedReportsDto> {
    return this.reportsService.getMyReports(userId, query);
  }
}
