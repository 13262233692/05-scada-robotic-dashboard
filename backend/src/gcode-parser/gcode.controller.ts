import {
  Controller,
  Post,
  Get,
  UploadedFile,
  UseInterceptors,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { GCodeParserEngine } from './gcode-parser.service';
import { GCodeParseResult } from './types';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'gcode');

@Controller('gcode')
export class GCodeController {
  private parser: GCodeParserEngine;
  private history: Array<{
    id: string;
    filename: string;
    uploadTime: number;
    result: GCodeParseResult;
  }> = [];

  constructor() {
    this.parser = new GCodeParserEngine();
    this.ensureUploadDir();
  }

  private ensureUploadDir() {
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
  }

  @Post('parse')
  parseGCode(@Body() body: { content: string; filename?: string }): GCodeParseResult {
    if (!body.content) {
      throw new HttpException('GCode content is required', HttpStatus.BAD_REQUEST);
    }

    const result = this.parser.parse(body.content);

    if (result.success && body.filename) {
      const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      this.history.unshift({
        id,
        filename: body.filename,
        uploadTime: Date.now(),
        result,
      });
      if (this.history.length > 50) {
        this.history.pop();
      }
    }

    return result;
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (req, file, cb) => {
          const uniqueName = `${Date.now()}-${file.originalname}`;
          cb(null, uniqueName);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(nc|gcode|txt|tap)$/i)) {
          return cb(new Error('Only GCode files are allowed!'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 10 * 1024 * 1024 },
    })
  )
  async uploadGCode(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
    }

    try {
      const content = fs.readFileSync(file.path, 'utf-8');
      const result = this.parser.parse(content);

      const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      this.history.unshift({
        id,
        filename: file.originalname,
        uploadTime: Date.now(),
        result,
      });
      if (this.history.length > 50) {
        this.history.pop();
      }

      return {
        success: true,
        id,
        filename: file.originalname,
        size: file.size,
        result,
      };
    } catch (e) {
      throw new HttpException(
        `Failed to parse file: ${e.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('history')
  getHistory() {
    return this.history.map((item) => ({
      id: item.id,
      filename: item.filename,
      uploadTime: item.uploadTime,
      metadata: item.result.metadata,
    }));
  }

  @Get('history/:id')
  getHistoryItem(@Body() params: { id: string }) {
    const item = this.history.find((h) => h.id === params.id);
    if (!item) {
      throw new HttpException('History item not found', HttpStatus.NOT_FOUND);
    }
    return item;
  }
}
