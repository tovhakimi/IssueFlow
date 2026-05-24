import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  HttpCode,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Post()
  @HttpCode(200)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @HttpCode(200)
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':userId')
  @HttpCode(200)
  findOne(@Param('userId', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Post('update/:userId')
  @HttpCode(200)
  update(@Param('userId', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':userId')
  @HttpCode(200)
  async delete(@Param('userId', ParseIntPipe) id: number, @CurrentUser() user: any) {
    await this.usersService.delete(id, user.id);
    return { message: 'User deleted' };
  }
}
