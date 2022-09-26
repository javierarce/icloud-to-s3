import * as dotenv from 'dotenv' 
import * as fs from 'fs'

import AWS from 'aws-sdk'
import Path from 'path'
import Request from 'request'
import Stream from 'stream'
import { getImages } from 'icloud-shared-album'

dotenv.config()

const FILENAME = 'photos.json'

const FOLDER = process.env.FOLDER

const S3_ID = process.env.S3_ID
const S3_SECRET = process.env.S3_SECRET
const BUCKET_NAME = process.env.S3_BUCKET_NAME

class Cloud {
  constructor (albumID) {
    this.albumID = albumID
    this.S3 = new AWS.S3({
      accessKeyId: S3_ID,
      secretAccessKey: S3_SECRET
    })

    if (!fs.existsSync(FILENAME)) {
      console.error(`File ${FILENAME} not found`)
      return
    }

    this.uploadedItems = JSON.parse(fs.readFileSync(FILENAME))
    this.start()
  }

  start () {
    getImages(this.albumID).then(this.onGetData.bind(this))
  }

  writeUploadedFilenames (filenames) {
    this.uploadedItems = this.uploadedItems.concat(filenames)

    fs.writeFile(FILENAME, JSON.stringify(this.uploadedItems), (error, data) => {
      if (error) {
        throw(error)
      }
      console.log('OK')
    })
  }

  extractFilenameFromURL (URL) {
    return Path.basename(URL).split('?')[0]
  }

  getS3BucketInfo (filename, URL) {
    const ext = Path.extname(filename).substring(1)
    const Body = new Stream.PassThrough()

    Request(URL).pipe(Body)

    return {
      Bucket: BUCKET_NAME,
      Key: `${FOLDER}/${filename}`,
      ContentType:`image/${ext}`,
      Body
    }
  }

  uploadImage (photoID, URL) {
    return new Promise((resolve, reject) => {

      const filename = this.extractFilenameFromURL(URL)

      this.S3.upload(this.getS3BucketInfo(filename, URL), (error, data) => {
        if (error) {
          return reject(error)
        }
        resolve(filename)
      })
    })
  }

  onGetData (data) {
    if (!data || !data.photos.length) {
      return
    }

    let promises = []

    data.photos.forEach(async (photo) => {
      let size = 0
      let selectedVersion = undefined

      Object.values(photo.derivatives).forEach((version) => {
        if (version.fileSize > size) {
          selectedVersion = version
          size = selectedVersion.fileSize
        }
      })

      if (selectedVersion) {
        if (!this.uploadedItems.includes(photo.photoGuid)) {
          promises.push(this.uploadImage(photo.photoGuid, selectedVersion.url))
        } 
      }
    })

    Promise.all(promises).then((filenames) => {
      this.writeUploadedFilenames(filenames)
    })
  }
}

const cloud = new Cloud(process.env.ALBUM_ID)
