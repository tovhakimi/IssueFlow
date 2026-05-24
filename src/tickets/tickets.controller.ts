import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { extname } from 'path';
import { Response } from 'express';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { CreateDependencyDto } from './dto/create-dependency.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/user.entity';

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'application/pdf', 'text/plain'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  @HttpCode(200)
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: any) {
    return this.ticketsService.create(dto, user.id);
  }

  @Get()
  @HttpCode(200)
  findAll(@Query('projectId') projectId?: string) {
    return this.ticketsService.findAll(projectId ? parseInt(projectId, 10) : undefined);
  }

  // ─── Static routes BEFORE /:ticketId ────────────────────────────────────────

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('deleted')
  @HttpCode(200)
  findDeleted() {
    return this.ticketsService.findDeleted();
  }

  @Get('export')
  @HttpCode(200)
  async exportCsv(@Query('projectId') projectId: string, @Res() res: Response) {
    const csv = await this.ticketsService.exportCsv(parseInt(projectId, 10));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="tickets.csv"');
    res.send(csv);
  }

  @Post('import')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  importCsv(
    @UploadedFile() file: Express.Multer.File,
    @Query('projectId') projectId: string,
    @CurrentUser() user: any,
  ) {
    return this.ticketsService.importCsv(file, parseInt(projectId, 10), user.id);
  }

  // ─── Parameterized routes ────────────────────────────────────────────────────

  @Get(':ticketId')
  @HttpCode(200)
  findOne(@Param('ticketId', ParseIntPipe) id: number) {
    return this.ticketsService.findOne(id);
  }

  @Patch(':ticketId')
  @HttpCode(200)
  update(
    @Param('ticketId', ParseIntPipe) id: number,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: any,
  ) {
    return this.ticketsService.update(id, dto, user.id);
  }

  @Delete(':ticketId')
  @HttpCode(200)
  remove(@Param('ticketId', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ticketsService.softDelete(id, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':ticketId/restore')
  @HttpCode(200)
  restore(@Param('ticketId', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.ticketsService.restore(id, user.id);
  }

  // ─── Dependencies ────────────────────────────────────────────────────────────

  @Get(':ticketId/dependencies')
  @HttpCode(200)
  getDependencies(@Param('ticketId', ParseIntPipe) id: number) {
    return this.ticketsService.getDependencies(id);
  }

  @Post(':ticketId/dependencies')
  @HttpCode(200)
  addDependency(
    @Param('ticketId', ParseIntPipe) id: number,
    @Body() dto: CreateDependencyDto,
    @CurrentUser() user: any,
  ) {
    return this.ticketsService.addDependency(id, dto, user.id);
  }

  @Delete(':ticketId/dependencies/:blockerId')
  @HttpCode(200)
  removeDependency(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('blockerId', ParseIntPipe) blockerId: number,
    @CurrentUser() user: any,
  ) {
    return this.ticketsService.removeDependency(ticketId, blockerId, user.id);
  }

  // ─── Attachments ─────────────────────────────────────────────────────────────

  @Get(':ticketId/attachments')
  @HttpCode(200)
  getAttachments(@Param('ticketId', ParseIntPipe) id: number) {
    return this.ticketsService.getAttachments(id);
  }

  @Post(':ticketId/attachments')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: process.env.UPLOAD_PATH || './uploads',
        filename: (_req, file, cb) => {
          const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error(`File type ${file.mimetype} not allowed`), false);
        }
      },
    }),
  )
  addAttachment(
    @Param('ticketId', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.ticketsService.addAttachment(id, file);
  }

  @Delete(':ticketId/attachments/:attachmentId')
  @HttpCode(200)
  deleteAttachment(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
  ) {
    return this.ticketsService.deleteAttachment(ticketId, attachmentId);
  }
}
