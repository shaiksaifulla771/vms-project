const fs = require('fs');
const path = require('path');
const AWS = require('aws-sdk');

class ObjectStorage {
  async upload(buffer, fileName, mimetype) {
    throw new Error('Not implemented');
  }

  async download(fileName) {
    throw new Error('Not implemented');
  }
}

class LocalDiskAdapter extends ObjectStorage {
  constructor() {
    super();
    this.uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async upload(buffer, fileName, mimetype) {
    const filePath = path.join(this.uploadDir, fileName);
    fs.writeFileSync(filePath, buffer);
    return filePath; // In dev, we return the local path
  }

  async download(fileName) {
    const filePath = path.join(this.uploadDir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }
    return fs.readFileSync(filePath);
  }
}

class S3Adapter extends ObjectStorage {
  constructor() {
    super();
    this.s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION
    });
    this.bucket = process.env.AWS_S3_BUCKET;
  }

  async upload(buffer, fileName, mimetype) {
    const params = {
      Bucket: this.bucket,
      Key: fileName,
      Body: buffer,
      ContentType: mimetype
    };
    const result = await this.s3.upload(params).promise();
    return result.Location;
  }

  async download(fileName) {
    const params = {
      Bucket: this.bucket,
      Key: fileName
    };
    const data = await this.s3.getObject(params).promise();
    return data.Body;
  }
}

function getStorageAdapter() {
  if (process.env.NODE_ENV === 'production' || process.env.USE_S3 === 'true') {
    if (!process.env.AWS_S3_BUCKET) {
      console.warn('⚠️ AWS_S3_BUCKET not set! Falling back to LocalDiskAdapter for object storage.');
      return new LocalDiskAdapter();
    }
    return new S3Adapter();
  }
  return new LocalDiskAdapter();
}

module.exports = {
  storage: getStorageAdapter(),
  ObjectStorage,
  LocalDiskAdapter,
  S3Adapter
};
