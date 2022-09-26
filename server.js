import { getImages } from 'icloud-shared-album'
import * as dotenv from 'dotenv' 
import * as fs from 'fs'

import AWS from 'aws-sdk'

import Stream from 'stream'
import Path from 'path'
import Request from 'request'

dotenv.config()

const FILENAME = 'photos.json'
const MAX_WIDTH = 6000

const S3_ID = process.env.S3_ID
const S3_SECRET = process.env.S3_SECRET
const BUCKET_NAME = process.env.S3_BUCKET_NAME
const RESOLUTIONS = [128, 640, 1280, 2880]
const EXTENSIONS = ['jpg', 'webp']

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

  writeUploadedIds (ids) {
    this.uploadedItems = this.uploadedItems.concat(ids)

    fs.writeFile(FILENAME, JSON.stringify(this.uploadedItems), (error, data) => {
      if (error) {
        throw(error)
      }
      console.log('OK')
    })
  }

  uploadImage (photoID, URL) {
    return new Promise((resolve, reject) => {
      const Body = new Stream.PassThrough()

      Request(URL).pipe(Body)
      
      const filename = Path.basename(URL).split('?')[0]
      const ext = Path.extname(filename).substring(1)

      const info = {
        Bucket: BUCKET_NAME,
        Key: `stream/${filename}`,
        ContentType:`image/${ext}`,
        Body
      }

      this.S3.upload(info, (error, data) => {
        if (error) {
          return reject(error)
        }
        resolve(photoID)
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

    Promise.all(promises).then((ids) => {
      this.writeUploadedIds(ids)
    })
  }
}

const cloud = new Cloud(process.env.ALBUM_ID)
