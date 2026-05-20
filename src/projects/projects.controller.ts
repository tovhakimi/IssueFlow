import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  HttpCode,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UseGuards } from '@nestjs/common';
import { UserRole } from '../users/user.entity';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @HttpCode(200)
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: any) {
    return this.projectsService.create(dto, user.id);
  }

  @Get()
  @HttpCode(200)
  findAll() {
    return this.projectsService.findAll();
  }

  // Static routes BEFORE /:projectId
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('deleted')
  @HttpCode(200)
  findDeleted() {
    return this.projectsService.findDeleted();
  }

  @Get(':projectId')
  @HttpCode(200)
  findOne(@Param('projectId', ParseIntPipe) id: number) {
    return this.projectsService.findOne(id);
  }

  @Patch(':projectId')
  @HttpCode(200)
  update(
    @Param('projectId', ParseIntPipe) id: number,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: any,
  ) {
    return this.projectsService.update(id, dto, user.id);
  }

  @Delete(':projectId')
  @HttpCode(200)
  remove(@Param('projectId', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.projectsService.softDelete(id, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':projectId/restore')
  @HttpCode(200)
  restore(@Param('projectId', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.projectsService.restore(id, user.id);
  }

  @Get(':projectId/workload')
  @HttpCode(200)
  getWorkload(@Param('projectId', ParseIntPipe) id: number) {
    return this.projectsService.getWorkload(id);
  }
}
